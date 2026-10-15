/**
 * Напоминание о брошенной корзине: покупатель вошёл, положил товары и не оформил заказ.
 *
 * Правила:
 *   • только тем, кто дал согласие на рассылку (напоминание с товарами — тоже реклама);
 *   • через N часов после последнего изменения корзины (админка → Настройки), не позже чем через 7 дней;
 *   • одно напоминание на одну и ту же корзину и не чаще раза в 3 дня;
 *   • только днём (10:00–21:00 по Москве);
 *   • только товары, которые есть в наличии, с актуальными ценами.
 */
import "server-only";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { unsubscribeUrl } from "@/lib/campaigns";
import { num, rub } from "@/lib/format";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { computeQuote } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { send as tgSend, esc as tgEsc, telegramEnabled } from "@/lib/telegram";

const mskHour = () => Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date()));
const abs = (url: string) => (url.startsWith("/") ? `${SITE.url}${url}` : url);

export async function remindAbandonedCarts(opts: { ignoreQuietHours?: boolean } = {}) {
  const hours = (await getSettings()).checkout.abandonedHours;
  if (!hours) return 0;
  if (!opts.ignoreQuietHours) {
    const h = mskHour();
    if (h < 10 || h >= 21) return 0;
  }
  if (!mailEnabled() && !telegramEnabled()) return 0;

  const now = Date.now();
  const rows = await db
    .select({ cart: s.savedCart, user: s.user })
    .from(s.savedCart)
    .innerJoin(s.user, eq(s.user.id, s.savedCart.userId))
    .where(
      and(
        sql`jsonb_array_length(${s.savedCart.items}) > 0`,
        lt(s.savedCart.updatedAt, new Date(now - hours * 3600_000)),
        gt(s.savedCart.updatedAt, new Date(now - 7 * 86400_000)),
        // эту корзину ещё не напоминали, и последнее напоминание было больше 3 дней назад
        or(isNull(s.savedCart.remindedAt), and(lt(s.savedCart.remindedAt, s.savedCart.updatedAt), lt(s.savedCart.remindedAt, new Date(now - 3 * 86400_000)))),
        sql`exists (select 1 from ${s.consent} c where c.user_id = ${s.user.id} and c.kind = 'MARKETING' and c.revoked_at is null)`,
        sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`,
        // после изменения корзины заказов не было
        sql`not exists (select 1 from ${s.order} o where o.user_id = ${s.user.id} and o.created_at > ${s.savedCart.updatedAt})`,
      ),
    )
    .limit(30);

  let sent = 0;
  for (const { cart, user } of rows) {
    // Отмечаем сразу — даже если товаров уже нет, второй раз эту корзину не проверяем
    await db
      .update(s.savedCart)
      .set({ remindedAt: new Date(), remindCount: sql`${s.savedCart.remindCount} + 1` })
      .where(eq(s.savedCart.userId, cart.userId));
    try {
      const quote = await computeQuote({ lines: cart.items }, user);
      if (!quote.lines.length) continue;
      const link = `${SITE.url}/cart?utm_source=__CH__&utm_medium=trigger&utm_campaign=abandoned_cart`;
      const first = user.name.trim().split(/\s+/)[0];

      if (mailEnabled() && !isPlaceholderEmail(user.email)) {
        const rowsHtml = quote.lines
          .slice(0, 6)
          .map(
            (l) => `<tr>
<td style="padding:8px 12px 8px 0;width:64px">${l.image ? `<img src="${escHtml(abs(l.image))}" width="56" height="56" alt="" style="display:block;object-fit:cover;background:#1a1a1d">` : ""}</td>
<td style="padding:8px 0;color:#f3f2ef;font-size:14px">${escHtml(l.name)}${l.variantName ? `<br><span style="color:#a3a3a8;font-size:13px">${escHtml(l.variantName)}</span>` : ""}</td>
<td style="padding:8px 0 8px 12px;color:#f3f2ef;font-size:14px;white-space:nowrap;text-align:right">${l.qty > 1 ? `${l.qty} × ` : ""}${rub(l.price)}</td></tr>`,
          )
          .join("");
        const more = quote.lines.length > 6 ? `<div style="color:#a3a3a8;font-size:13px">и ещё ${quote.lines.length - 6}</div>` : "";
        const body =
          `${first ? `Здравствуйте, ${escHtml(first)}!<br><br>` : ""}Вы положили товары в корзину, но не оформили заказ. Мы их сохранили:` +
          `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 8px;border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a">${rowsHtml}</table>${more}` +
          `<div style="margin-top:8px">Итого за товары: <b>${rub(quote.subtotal)}</b></div>` +
          (quote.accrue > 0 ? `<div style="color:#a3a3a8;font-size:13px;margin-top:4px">За этот заказ начислим ${num(quote.accrue / 100)} бонусов</div>` : "") +
          `<div style="color:#a3a3a8;font-size:13px;margin-top:12px">Цены и наличие — на момент письма. Товары не забронированы, их могут раскупить.</div>`;
        const unsub = unsubscribeUrl(user.id);
        await sendMail(user.email, "Вы забыли товары в корзине", "Ваша корзина ждёт", body, { text: "Оформить заказ", url: link.replace("__CH__", "email") }, {
          footerHtml: `Вы получили письмо, потому что подписались на новости и акции Abramov Shop. <a href="${unsub}" style="color:#a3a3a8">Отписаться</a>`,
          headers: {
            "List-Unsubscribe": `<${SITE.url}/api/unsubscribe?u=${encodeURIComponent(user.id)}&t=${unsub.split("&t=")[1]}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        sent++;
      } else if (telegramEnabled() && user.telegramChatId) {
        // В Telegram — без имени и без адресов: только названия товаров
        const list = quote.lines
          .slice(0, 6)
          .map((l) => `• ${tgEsc(l.name)}${l.variantName ? ` (${tgEsc(l.variantName)})` : ""} — ${rub(l.price)}`)
          .join("\n");
        await tgSend(user.telegramChatId, `🛒 <b>Ваша корзина ждёт</b>\n\n${list}\n\nИтого за товары: <b>${rub(quote.subtotal)}</b>`, [
          { text: "Оформить заказ", url: link.replace("__CH__", "telegram") },
          { text: "Отписаться от напоминаний", url: unsubscribeUrl(user.id) },
        ]);
        sent++;
      }
    } catch (e) {
      console.error("[abandoned]", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

/** Для админки: сколько напомнили и сколько после этого оформили заказ за 30 дней. */
export async function abandonedStats() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [reminded, recovered] = await Promise.all([
    db.$count(s.savedCart, gt(s.savedCart.remindedAt, since)),
    db.$count(s.savedCart, gt(s.savedCart.recoveredAt, since)),
  ]);
  return { reminded, recovered };
}
