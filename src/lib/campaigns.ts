/**
 * Рассылки: промокоды и новости на почту и в Telegram.
 *
 * Закон о рекламе (38-ФЗ, ст. 18): рекламу можно присылать только тем, кто заранее согласился.
 * Поэтому получатели — только пользователи с действующим согласием на рассылку (журнал согласий),
 * в каждом письме — ссылка «Отписаться», которая отзывает согласие.
 *
 * Отправка идёт очередью в фоне: не больше MAIL_PER_MINUTE писем в минуту и MAIL_DAILY_LIMIT
 * писем рассылок в сутки (у Gmail лимит ~500 писем в день). Большая рассылка растянется,
 * сайт продолжит сам, в том числе после перезапуска.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDate, rub } from "@/lib/format";
import { escHtml, mailEnabled, sendMail, type MailExtra } from "@/lib/mail";
import { isPlaceholderEmail, PLACEHOLDER_DOMAIN, SITE } from "@/lib/site";
import { send as tgSend, esc as tgEsc, notifyAdmins, telegramEnabled } from "@/lib/telegram";

export const MAIL_PER_MINUTE = Math.max(1, Number(process.env.MAIL_PER_MINUTE) || 20);
export const MAIL_DAILY_LIMIT = Math.max(1, Number(process.env.MAIL_DAILY_LIMIT) || 450);
const TG_PER_MINUTE = 60;

type Campaign = typeof s.campaign.$inferSelect;
type Promo = typeof s.promoCode.$inferSelect;

// ---------- Отписка

const secret = () => process.env.BETTER_AUTH_SECRET || "dev-secret";
const sign = (userId: string) => createHmac("sha256", secret()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);

export function unsubscribeUrl(userId: string) {
  return `${SITE.url}/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function checkUnsubscribe(userId: string | null | undefined, token: string | null | undefined) {
  if (!userId || !token) return false;
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Отзыв согласия на рекламу по ссылке из письма. Строка в журнале согласий остаётся, с отметкой отзыва. */
export async function unsubscribe(userId: string, ip: string | null) {
  const { revokeConsent, getActiveConsent } = await import("@/lib/consent");
  const active = await getActiveConsent(userId, "MARKETING");
  if (active) await revokeConsent(userId, "MARKETING", ip);
  return !!active;
}

// ---------- Промокод в письме

export function promoHeadline(p: Pick<Promo, "type" | "value">) {
  return p.type === "PERCENT" ? `Скидка ${p.value}%` : p.type === "FIXED" ? `Скидка ${rub(p.value)}` : "Бесплатная доставка";
}

export function promoConditions(p: Promo, categoryName?: string | null) {
  return [
    p.minOrder ? `при заказе от ${rub(p.minOrder)}` : null,
    categoryName ? `на категорию «${categoryName}»` : null,
    p.firstOrderOnly ? "на первый заказ" : null,
    !p.combinableWithBonus ? "не суммируется с бонусами" : null,
    p.endsAt ? `до ${fmtDate(p.endsAt)} включительно` : null,
  ].filter(Boolean) as string[];
}

/** Почему промокод нельзя рассылать прямо сейчас (или null, если можно). */
export function promoProblem(p: Promo | null | undefined) {
  if (!p) return null;
  const now = new Date();
  if (!p.isActive) return "Промокод выключен — включите его в разделе «Промокоды»";
  if (p.endsAt && p.endsAt < now) return "Срок действия промокода уже закончился";
  if (p.maxUses != null && p.usedCount >= p.maxUses) return "Промокод уже израсходован";
  return null;
}

// ---------- Получатели

interface AudienceOpts {
  channelEmail: boolean;
  channelTelegram: boolean;
  onlyVerified: boolean;
}

/** Пользователи с действующим согласием на рекламу, не заблокированные. */
function audienceWhere(extra: SQL[]) {
  return and(
    sql`exists (select 1 from ${s.consent} c where c.user_id = ${s.user.id} and c.kind = 'MARKETING' and c.revoked_at is null)`,
    sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`,
    ...extra,
  );
}

const emailWhere = (onlyVerified: boolean) =>
  audienceWhere([sql`${s.user.email} not like ${"%@" + PLACEHOLDER_DOMAIN}`, ...(onlyVerified ? [eq(s.user.emailVerified, true)] : [])]);
const tgWhere = () => audienceWhere([isNotNull(s.user.telegramChatId)]);

export async function audienceCount(o: AudienceOpts) {
  const [email, telegram] = await Promise.all([
    o.channelEmail && mailEnabled() ? db.$count(s.user, emailWhere(o.onlyVerified)) : 0,
    o.channelTelegram && telegramEnabled() ? db.$count(s.user, tgWhere()) : 0,
  ]);
  return { email, telegram };
}

/** Сколько всего подписчиков (для подсказки в админке). */
export async function subscriberStats() {
  const [all, verified, telegram] = await Promise.all([
    db.$count(s.user, emailWhere(false)),
    db.$count(s.user, emailWhere(true)),
    db.$count(s.user, tgWhere()),
  ]);
  return { all, verified, telegram };
}

// ---------- Содержимое

function absolute(url: string) {
  return url.startsWith("/") ? `${SITE.url}${url}` : url;
}

/** Ссылка кнопки: на сайт добавляем промокод (применится в корзине сам) и метки для Метрики. */
function buttonLink(c: Campaign, promo: Promo | null, channel: "email" | "telegram") {
  const raw = absolute(c.buttonUrl || "/catalog");
  try {
    const u = new URL(raw);
    if (u.origin === new URL(SITE.url).origin) {
      if (promo) u.searchParams.set("promo", promo.code);
      u.searchParams.set("utm_source", channel);
      u.searchParams.set("utm_medium", "mailing");
      u.searchParams.set("utm_campaign", promo?.code.toLowerCase() ?? `news-${c.id.slice(0, 6)}`);
    }
    return u.toString();
  } catch {
    return `${SITE.url}/catalog`;
  }
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";

export async function loadPromo(c: Pick<Campaign, "promoCodeId">) {
  if (!c.promoCodeId) return { promo: null, categoryName: null };
  const promo = (await db.query.promoCode.findFirst({ where: eq(s.promoCode.id, c.promoCodeId) })) ?? null;
  const cat = promo?.categoryId ? await db.query.category.findFirst({ where: eq(s.category.id, promo.categoryId), columns: { name: true } }) : null;
  return { promo, categoryName: cat?.name ?? null };
}

export function renderEmail(c: Campaign, promo: Promo | null, categoryName: string | null, user: { id: string; name: string | null }) {
  const hi = firstName(user.name);
  const paragraphs = escHtml(c.body.trim()).replace(/\r?\n/g, "<br>");
  const promoBlock = promo
    ? `<div style="margin:22px 0 6px;padding:20px 16px;border:1px dashed #dcbf83;text-align:center">
<div style="font-size:12px;letter-spacing:3px;color:#a3a3a8;text-transform:uppercase">Промокод</div>
<div style="font-size:30px;font-weight:bold;letter-spacing:5px;color:#dcbf83;margin:8px 0">${escHtml(promo.code)}</div>
<div style="font-size:15px;color:#f3f2ef;font-weight:bold">${escHtml(promoHeadline(promo))}</div>
${promoConditions(promo, categoryName).length ? `<div style="font-size:13px;color:#a3a3a8;margin-top:6px">${escHtml(promoConditions(promo, categoryName).join(" · "))}</div>` : ""}
<div style="font-size:12px;color:#7a7a80;margin-top:10px">Введите код в корзине при оформлении — или нажмите кнопку ниже, он подставится сам</div>
</div>`
    : "";
  const body = `${hi ? `Здравствуйте, ${escHtml(hi)}!<br><br>` : ""}${paragraphs}${promoBlock}`;
  const unsub = unsubscribeUrl(user.id);
  const extra: MailExtra = {
    footerHtml: `Вы получили письмо, потому что подписались на новости и акции Abramov Shop. <a href="${unsub}" style="color:#a3a3a8">Отписаться</a>`,
    headers: {
      "List-Unsubscribe": `<${SITE.url}/api/unsubscribe?u=${encodeURIComponent(user.id)}&t=${unsub.split("&t=")[1]}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  const button = { text: c.buttonText || (promo ? "Выбрать товары" : "Перейти на сайт"), url: buttonLink(c, promo, "email") };
  return { subject: c.subject, title: c.title, body, button, extra };
}

/** В Telegram без обращения по имени: личные данные за границу не передаём (152-ФЗ). */
function renderTelegram(c: Campaign, promo: Promo | null, categoryName: string | null, user: { id: string }) {
  const lines = [`<b>${tgEsc(c.title)}</b>`, "", tgEsc(c.body.trim())];
  if (promo) {
    const cond = promoConditions(promo, categoryName);
    lines.push("", `🎟 Промокод <code>${tgEsc(promo.code)}</code> — ${tgEsc(promoHeadline(promo))}${cond.length ? ` (${tgEsc(cond.join(", "))})` : ""}`);
  }
  const buttons = [
    { text: c.buttonText || (promo ? "Выбрать товары" : "Перейти на сайт"), url: buttonLink(c, promo, "telegram") },
    { text: "Отписаться от рассылки", url: unsubscribeUrl(user.id) },
  ];
  return { html: lines.join("\n"), buttons };
}

// ---------- Действия

/** Тестовое письмо (и сообщение в Telegram) самому админу — без проверки согласия. */
export async function sendTest(c: Campaign, admin: { id: string; name: string | null; email: string; telegramChatId: string | null }) {
  const { promo, categoryName } = await loadPromo(c);
  const done: string[] = [];
  if (c.channelEmail && mailEnabled() && !isPlaceholderEmail(admin.email)) {
    const m = renderEmail(c, promo, categoryName, admin);
    await sendMail(admin.email, `[Тест] ${m.subject}`, m.title, m.body, m.button, m.extra);
    done.push(`письмо на ${admin.email}`);
  }
  if (c.channelTelegram && telegramEnabled() && admin.telegramChatId) {
    const t = renderTelegram(c, promo, categoryName, admin);
    await tgSend(admin.telegramChatId, `🧪 Тест рассылки\n\n${t.html}`, t.buttons);
    done.push("сообщение в Telegram");
  }
  return done;
}

/** Запуск: фиксируем список получателей на этот момент и ставим в очередь. */
export async function startCampaign(c: Campaign) {
  const { promo } = await loadPromo(c);
  const problem = promoProblem(promo);
  if (problem) throw new Error(problem);
  if (c.promoCodeId && !promo) throw new Error("Промокод удалён — выберите другой");

  return db.transaction(async (tx) => {
    let total = 0;
    if (c.channelEmail && mailEnabled()) {
      const r = await tx.execute(sql`
        insert into ${s.campaignRecipient} (id, campaign_id, user_id, channel, address)
        select gen_random_uuid()::text, ${c.id}, ${s.user.id}, 'email', ${s.user.email} from ${s.user}
        where ${emailWhere(c.onlyVerified)}
        on conflict do nothing`);
      total += r.rowCount ?? 0;
    }
    if (c.channelTelegram && telegramEnabled()) {
      const r = await tx.execute(sql`
        insert into ${s.campaignRecipient} (id, campaign_id, user_id, channel, address)
        select gen_random_uuid()::text, ${c.id}, ${s.user.id}, 'telegram', ${s.user.telegramChatId} from ${s.user}
        where ${tgWhere()}
        on conflict do nothing`);
      total += r.rowCount ?? 0;
    }
    if (!total) throw new Error("Некому отправлять: нет подписчиков с согласием на рассылку");
    await tx
      .update(s.campaign)
      .set({ status: "SENDING", total, startedAt: new Date() })
      .where(and(eq(s.campaign.id, c.id), eq(s.campaign.status, "DRAFT")));
    return total;
  });
}

export async function cancelCampaign(id: string) {
  await db.transaction(async (tx) => {
    const r = await tx
      .update(s.campaignRecipient)
      .set({ status: "SKIPPED", error: "Рассылка остановлена" })
      .where(and(eq(s.campaignRecipient.campaignId, id), eq(s.campaignRecipient.status, "PENDING")));
    await tx
      .update(s.campaign)
      .set({ status: "CANCELLED", finishedAt: new Date(), skipped: sql`${s.campaign.skipped} + ${r.rowCount ?? 0}` })
      .where(and(eq(s.campaign.id, id), eq(s.campaign.status, "SENDING")));
  });
}

/** Сколько писем рассылок ушло за последние сутки — для суточного лимита почты. */
async function emailsLast24h() {
  return db.$count(
    s.campaignRecipient,
    and(eq(s.campaignRecipient.channel, "email"), eq(s.campaignRecipient.status, "SENT"), gte(s.campaignRecipient.sentAt, new Date(Date.now() - 86400_000))),
  );
}

export async function sendingQuota() {
  const used = await emailsLast24h();
  return { used, limit: MAIL_DAILY_LIMIT, perMinute: MAIL_PER_MINUTE };
}

const g = globalThis as unknown as { __asCampaignBusy?: boolean };

/** Шаг очереди (вызывается раз в минуту и сразу после запуска рассылки). */
export async function processCampaigns() {
  if (g.__asCampaignBusy) return;
  g.__asCampaignBusy = true;
  try {
    const active = await db.query.campaign.findMany({ where: eq(s.campaign.status, "SENDING"), orderBy: asc(s.campaign.startedAt) });
    if (!active.length) return;
    let emailBudget = Math.min(MAIL_PER_MINUTE, MAIL_DAILY_LIMIT - (await emailsLast24h()));
    let tgBudget = TG_PER_MINUTE;

    for (const c of active) {
      const { promo, categoryName } = await loadPromo(c);
      const channels = [
        ...(emailBudget > 0 ? (["email"] as const) : []),
        ...(tgBudget > 0 ? (["telegram"] as const) : []),
      ];
      if (!channels.length) break;
      const batch = await db.query.campaignRecipient.findMany({
        where: and(eq(s.campaignRecipient.campaignId, c.id), eq(s.campaignRecipient.status, "PENDING"), inArray(s.campaignRecipient.channel, [...channels])),
        with: { user: { columns: { id: true, name: true, bannedAt: true, bannedUntil: true } } },
        limit: Math.max(emailBudget, tgBudget),
      });

      // Перед отправкой ещё раз проверяем согласие: человек мог отписаться после запуска
      const ids = [...new Set(batch.map((r) => r.userId))];
      const stillSubscribed = new Set(
        ids.length
          ? (
              await db
                .selectDistinct({ userId: s.consent.userId })
                .from(s.consent)
                .where(and(inArray(s.consent.userId, ids), eq(s.consent.kind, "MARKETING"), isNull(s.consent.revokedAt)))
            ).map((r) => r.userId)
          : [],
      );

      for (const r of batch) {
        const isEmail = r.channel === "email";
        if (isEmail ? emailBudget <= 0 : tgBudget <= 0) continue;
        let status: "SENT" | "FAILED" | "SKIPPED" = "SENT";
        let error: string | null = null;
        const banned = r.user.bannedAt && (!r.user.bannedUntil || r.user.bannedUntil > new Date());
        if (!stillSubscribed.has(r.userId) || banned) {
          status = "SKIPPED";
          error = banned ? "Аккаунт заблокирован" : "Отписался";
        } else {
          try {
            if (isEmail) {
              emailBudget--;
              const m = renderEmail(c, promo, categoryName, r.user);
              await sendMail(r.address, m.subject, m.title, m.body, m.button, m.extra);
            } else {
              tgBudget--;
              const t = renderTelegram(c, promo, categoryName, r.user);
              await tgSend(r.address, t.html, t.buttons);
            }
          } catch (e) {
            status = "FAILED";
            error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          }
        }
        await db.update(s.campaignRecipient).set({ status, error, sentAt: new Date() }).where(eq(s.campaignRecipient.id, r.id));
        const col = status === "SENT" ? s.campaign.sent : status === "FAILED" ? s.campaign.failed : s.campaign.skipped;
        await db
          .update(s.campaign)
          .set({ [status === "SENT" ? "sent" : status === "FAILED" ? "failed" : "skipped"]: sql`${col} + 1` })
          .where(eq(s.campaign.id, c.id));
      }

      const left = await db.$count(s.campaignRecipient, and(eq(s.campaignRecipient.campaignId, c.id), eq(s.campaignRecipient.status, "PENDING")));
      if (!left) {
        const [done] = await db
          .update(s.campaign)
          .set({ status: "DONE", finishedAt: new Date() })
          .where(and(eq(s.campaign.id, c.id), eq(s.campaign.status, "SENDING")))
          .returning();
        if (done) {
          await notifyAdmins(
            `📨 Рассылка «${tgEsc(done.subject)}» завершена: доставлено ${done.sent}, ошибок ${done.failed}, пропущено ${done.skipped}.`,
            { text: "Открыть", url: `${SITE.url}/admin/mailing/${done.id}` },
          ).catch(() => {});
        }
      }
    }
  } finally {
    g.__asCampaignBusy = false;
  }
}
