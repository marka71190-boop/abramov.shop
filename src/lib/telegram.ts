/**
 * Telegram-бот магазина.
 *
 * Включается переменной TELEGRAM_BOT_TOKEN (выдаёт @BotFather).
 * При старте сайт сам регистрирует адрес /api/telegram/webhook у Telegram.
 *
 * Клиент привязывает Telegram из личного кабинета: кнопка ведёт на t.me/<бот>?start=<одноразовый код>.
 * Админы и менеджеры привязывают так же — и дополнительно получают уведомления о новых заказах.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { trackUrl } from "@/lib/cdek";
import { num, rub } from "@/lib/format";
import { orderStatus } from "@/lib/order-status";
import { serverSecret } from "@/lib/secret";
import { SITE } from "@/lib/site";

const API = () => `${process.env.TELEGRAM_API_URL || "https://api.telegram.org"}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;

/** Секрет для заголовка вебхука — выводится из BETTER_AUTH_SECRET, отдельная переменная не нужна. */
export const webhookSecret = () =>
  createHash("sha256")
    .update(`${serverSecret("")}:telegram`)
    .digest("hex")
    .slice(0, 48);

async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}

/** Состояние связи с Telegram — для админки. */
export const tgStatus = { lastOk: 0, lastError: "" as string, lastErrorAt: 0 };
const noteError = (e: unknown) => {
  tgStatus.lastError = e instanceof Error ? e.message : String(e);
  tgStatus.lastErrorAt = Date.now();
};

let me: { username: string } | null = null;
let meFailedAt = 0;
export async function botUsername(): Promise<string | null> {
  if (!telegramEnabled()) return null;
  if (me) return me.username;
  if (Date.now() - meFailedAt < 60_000) return null; // не ждём таймаут на каждой странице
  try {
    me = await call<{ username: string }>("getMe", {}, 5000);
    tgStatus.lastOk = Date.now();
    return me.username;
  } catch (e) {
    meFailedAt = Date.now();
    noteError(e);
    console.error("[telegram] getMe:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function send(chatId: string | number, html: string, buttons?: { text: string; url: string }[]) {
  return call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
  });
}

/**
 * Получение сообщений боту — «длинным опросом» (getUpdates).
 * Сайту не нужно, чтобы Telegram мог достучаться до сервера: все запросы исходящие.
 * С российских серверов api.telegram.org часто недоступен — тогда задайте TELEGRAM_API_URL
 * (релей за границей, см. relay/README.md).
 */
export async function startPolling() {
  if (!telegramEnabled()) return;
  const g = globalThis as unknown as { __tgPolling?: boolean };
  if (g.__tgPolling) return;
  g.__tgPolling = true;

  let offset = 0;
  let delay = 5_000;
  let ready = false;
  let lastLog = 0;
  for (;;) {
    try {
      if (!ready) {
        await call("deleteWebhook", { drop_pending_updates: false });
        await call("setMyCommands", {
          commands: [
            { command: "orders", description: "Мои заказы" },
            { command: "bonus", description: "Мои бонусы" },
            { command: "help", description: "Помощь" },
          ],
        }).catch(() => {});
        ready = true;
        console.log(`[telegram] Бот @${await botUsername()} на связи${process.env.TELEGRAM_API_URL ? " (через релей)" : ""}`);
      }
      const updates = await call<{ update_id: number }[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, 40_000);
      tgStatus.lastOk = Date.now();
      delay = 5_000;
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u as TgUpdate).catch((e) => console.error("[telegram] сообщение:", e instanceof Error ? e.message : e));
      }
    } catch (e) {
      noteError(e);
      // Пишем в лог не чаще раза в 10 минут, чтобы не засорять «Логи приложения»
      if (Date.now() - lastLog > 600_000) {
        lastLog = Date.now();
        console.error(
          `[telegram] Нет связи с Telegram: ${tgStatus.lastError}.` +
            (process.env.TELEGRAM_API_URL ? " Проверьте релей TELEGRAM_API_URL." : " С российских серверов api.telegram.org часто закрыт — нужен релей, см. relay/README.md."),
        );
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 120_000);
    }
  }
}

// ============================================================
// Привязка аккаунта
// ============================================================

const LINK_PREFIX = "tg-link:";

/** Одноразовая ссылка t.me/<бот>?start=<код>, живёт 30 минут. */
export async function createLinkUrl(userId: string) {
  const username = await botUsername();
  if (!username) return null;
  const code = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
  await db.delete(s.verification).where(eq(s.verification.identifier, LINK_PREFIX + userId));
  await db.insert(s.verification).values({
    id: crypto.randomUUID(),
    identifier: LINK_PREFIX + userId,
    value: code,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return `https://t.me/${username}?start=${code}`;
}

async function linkByCode(code: string, chatId: string) {
  const v = await db.query.verification.findFirst({
    where: and(eq(s.verification.value, code), gt(s.verification.expiresAt, new Date())),
  });
  if (!v?.identifier.startsWith(LINK_PREFIX)) return null;
  const userId = v.identifier.slice(LINK_PREFIX.length);
  await db.delete(s.verification).where(eq(s.verification.id, v.id));
  // Один чат — один аккаунт
  await db.update(s.user).set({ telegramChatId: null }).where(eq(s.user.telegramChatId, chatId));
  const [u] = await db.update(s.user).set({ telegramChatId: chatId, notifyTelegram: true }).where(eq(s.user.id, userId)).returning();
  return u ?? null;
}

// ============================================================
// Входящие сообщения
// ============================================================

interface TgUpdate {
  message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
}

export async function handleUpdate(u: TgUpdate) {
  const msg = u.message;
  if (!msg?.text || msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const site = SITE.url;

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (code && /^[0-9a-f]{36}$/.test(code)) {
      const user = await linkByCode(code, chatId);
      if (user) {
        const admin = user.role === "OWNER" || user.role === "MANAGER";
        const clubStaff = user.role === "CLUB";
        return send(
          chatId,
          `Готово, ${esc(user.name.split(" ")[0])}! Telegram привязан к аккаунту Abramov Shop.\n\n` +
            `Сюда придут оплата, трек-номер СДЭК и вручение заказа, а ещё начисление бонусов.` +
            (admin ? `\n\n<b>Вы админ</b> — сюда же будут приходить новые оплаченные заказы.` : "") +
            (clubStaff ? `\n\n<b>Вы администратор клуба</b> — сюда будут приходить заказы на выдачу в вашем клубе и кии для мастерской.` : "") +
            `\n\n/orders — мои заказы\n/bonus — мои бонусы`,
        );
      }
      return send(chatId, "Ссылка устарела. Откройте личный кабинет на сайте и нажмите «Подключить Telegram» ещё раз.", [
        { text: "Личный кабинет", url: `${site}/account#settings` },
      ]);
    }
    return send(
      chatId,
      `Здравствуйте! Это бот магазина <b>Abramov Shop</b>.\n\nЧтобы получать статусы заказов и бонусов, привяжите Telegram в личном кабинете — кнопка «Подключить Telegram».`,
      [{ text: "Открыть личный кабинет", url: `${site}/account#settings` }],
    );
  }

  const user = await db.query.user.findFirst({ where: eq(s.user.telegramChatId, chatId) });
  if (!user) {
    return send(chatId, "Telegram ещё не привязан к аккаунту. Нажмите «Подключить Telegram» в личном кабинете.", [
      { text: "Личный кабинет", url: `${site}/account#settings` },
    ]);
  }

  if (text.startsWith("/orders")) {
    const orders = await db.query.order.findMany({
      where: eq(s.order.userId, user.id),
      orderBy: (o, { desc }) => desc(o.createdAt),
      limit: 5,
    });
    if (!orders.length) return send(chatId, "Заказов пока нет.", [{ text: "В каталог", url: `${site}/#catalog` }]);
    const lines = orders.map(
      (o) =>
        `<b>${o.number}</b> — ${orderStatus(o.status, o.deliveryType).text}, ${rub(o.total)}` +
        (o.trackNumber ? `\nТрек: <a href="${trackUrl(o.trackNumber)}">${o.trackNumber}</a>` : ""),
    );
    return send(chatId, lines.join("\n\n"), [{ text: "Все заказы", url: `${site}/account#orders` }]);
  }
  if (text.startsWith("/bonus")) {
    return send(chatId, `На счёте <b>${num(user.bonusBalance)}</b> бонусов. 1 бонус = 1 ₽.`, [{ text: "Бонусная карта", url: `${site}/account#bonus` }]);
  }
  if (text.startsWith("/stop")) {
    await db.update(s.user).set({ notifyTelegram: false }).where(eq(s.user.id, user.id));
    return send(chatId, "Уведомления выключены. Включить снова можно в личном кабинете.");
  }
  return send(
    chatId,
    `/orders — мои заказы\n/bonus — мои бонусы\n/stop — выключить уведомления\n\nВопрос по заказу — напишите в поддержку, назовите номер заказа.`,
  );
}

// ============================================================
// Уведомления о заказах
// ============================================================

type OrderEvent = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";

/** Владелец и менеджеры с привязанным Telegram; заблокированным сотрудникам заказы и заявки не шлём. */
const staffWithTelegram = () =>
  and(
    inArray(s.user.role, ["OWNER", "MANAGER"]),
    isNotNull(s.user.telegramChatId),
    sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`,
  );

/** Сообщение клиенту и (для оплаты) админам. Ошибки Telegram не ломают работу магазина. */
export async function notifyOrder(orderId: string, event: OrderEvent, extra?: { note?: string }) {
  void emailOrderNotice(orderId, event);
  // Уведомление на телефон (если покупатель или сотрудники их включили)
  void import("@/lib/push").then((m) => m.pushOrder(orderId, event)).catch((e) => console.error("[push] заказ:", e));
  // Самовывоз: администраторам клуба — что везём к ним и что отменили
  void import("@/lib/club-staff").then((m) => m.notifyClubOrder(orderId, event)).catch((e) => console.error("[club] заказ:", e));
  if (!telegramEnabled()) return;
  // В фоне: если Telegram медленный или недоступен, оплата и кнопки в админке не ждут
  void sendOrderNotice(orderId, event, extra);
}

async function sendOrderNotice(orderId: string, event: OrderEvent, extra?: { note?: string }) {
  try {
    const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true, user: true } });
    if (!o) return;
    const site = SITE.url;
    const link = { text: "Открыть заказ", url: `${site}/order/${o.number}` };
    const u = o.user;

    if (u?.telegramChatId && u.notifyTelegram) {
      const reviewBonus = event === "delivered" ? (await (await import("@/lib/settings")).getSettings()).loyalty.reviewBonus : 0;
      const msg: Record<OrderEvent, string> = {
        paid: `✅ Заказ <b>${o.number}</b> оплачен — ${rub(o.total)}.\n${o.deliveryType === "PICKUP" ? "Соберём и напишем, когда можно забирать в клубе." : "Соберём и пришлём трек-номер СДЭК."}`,
        shipped: o.deliveryType === "PICKUP"
          ? `🏁 Заказ <b>${o.number}</b> ждёт вас в клубе. Назовите номер заказа администратору.`
          : `📦 Заказ <b>${o.number}</b> передан в СДЭК.` +
          (o.trackNumber ? `\nТрек: <a href="${trackUrl(o.trackNumber)}">${o.trackNumber}</a>` : "") +
          (o.deliveryDays ? `\nСрок в пути: ${o.deliveryDays} дн.` : ""),
        delivered:
          `🎉 Заказ <b>${o.number}</b> получен. Спасибо!` +
          (o.bonusAccrued ? `\nНачислено <b>${num(o.bonusAccrued / 100)}</b> бонусов.` : "") +
          (reviewBonus > 0 ? `\n\nОставьте отзыв о покупке — подарим ещё ${num(reviewBonus)} бонусов.` : ""),
        cancelled: `Заказ <b>${o.number}</b> отменён${o.cancelReason ? `: ${esc(o.cancelReason.toLowerCase())}` : ""}. Товар вернулся в продажу.`,
        refunded:
          (o.total > o.giftCardAmount ? `Деньги за заказ <b>${o.number}</b> возвращены — ${rub(o.total - o.giftCardAmount)}. Обычно они приходят на карту за 1–3 дня.` : `Заказ <b>${o.number}</b> возвращён.`) +
          (o.giftCardAmount > 0 ? `
${rub(o.giftCardAmount)} вернулись на подарочный сертификат.` : ""),
      };
      await send(u.telegramChatId, msg[event], o.trackNumber && event === "shipped" ? [{ text: "Отследить", url: trackUrl(o.trackNumber) }, link] : [link]).catch(
        (e) => console.error("[telegram] клиенту:", e.message),
      );
    }

    if (event === "paid") {
      const admins = await db
        .select({ chatId: s.user.telegramChatId })
        .from(s.user)
        .where(staffWithTelegram());
      const items = o.items.map((i) => `• ${esc(i.name)} × ${i.quantity}`).join("\n");
      const club = o.pickupClubId ? await import("@/lib/clubs").then((m) => m.getClub(o.pickupClubId)) : null;
      // Без имени, телефона, адреса и комментария: Telegram — иностранный сервис, персональные данные
      // покупателей туда не передаём (152-ФЗ). Всё это — в админке по кнопке.
      const text =
        `🛒 <b>Новый заказ ${o.number}</b> — ${rub(o.total)}\n` +
        `${o.deliveryType === "PICKUP" ? `Самовывоз: ${club ? `<b>${esc(club.name)}</b>` : "клуб"}` : o.deliveryType === "COURIER" ? "Курьер" : "ПВЗ"}${o.city ? `, ${esc(o.city)}` : ""}\n\n${items}` +
        (o.comment ? `\n\n💬 Есть комментарий покупателя — в админке` : "") +
        (extra?.note || o.cancelReason ? `\n\n⚠️ ${esc(extra?.note ?? o.cancelReason ?? "")}` : "");
      for (const a of admins) {
        if (a.chatId) await send(a.chatId, text, [{ text: "Открыть в админке", url: `${site}/admin/orders/${o.id}` }]).catch((e) => console.error("[telegram] админу:", e.message));
      }
    }
  } catch (e) {
    console.error("[telegram] notifyOrder:", e instanceof Error ? e.message : e);
  }
}

/** Письмо покупателю: оплата, отправка с трек-номером, возврат. */
async function emailOrderNotice(orderId: string, event: OrderEvent) {
  if (event !== "paid" && event !== "shipped" && event !== "refunded") return;
  try {
    const { mailEnabled, sendMail } = await import("@/lib/mail");
    if (!mailEnabled()) return;
    const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true } });
    if (!o) return;
    const url = `${SITE.url}/order/${o.number}`;
    const items = o.items
      .map(
        (i) =>
          `${esc(i.name)} × ${i.quantity} — ${rub(i.price * i.quantity)}` +
          (i.spec ? `<br><span style="color:#a3a3a8;font-size:13px">${esc(i.spec).replace(/\n/g, "<br>")}</span><br>` : ""),
      )
      .join("<br>");
    if (event === "paid") {
      await sendMail(
        o.email,
        `Заказ ${o.number} оплачен`,
        `Спасибо! Заказ ${o.number} оплачен`,
        `${items}<br><br>Итого: <b>${rub(o.total)}</b>${o.giftCardAmount > 0 ? `, из них сертификатом ${rub(o.giftCardAmount)}` : ""}<br>${o.deliveryType === "PICKUP" ? "Самовывоз" : "Доставка СДЭК"}: ${esc([o.city, o.address].filter(Boolean).join(", "))}<br><br>${o.items.some((i) => i.spec) ? `Кий изготовим за ${(await import("@/lib/cue").then((m) => m.getCueConfig())).leadDays} дн., затем ${o.deliveryType === "PICKUP" ? "привезём в клуб и напишем" : "отправим СДЭК и пришлём трек-номер"}.` : o.deliveryType === "PICKUP" ? "Соберём заказ и пришлём письмо, когда можно забирать." : "Мы соберём заказ и пришлём трек-номер."}` +
          (o.bonusAccrued ? `<br>После получения начислим ${num(o.bonusAccrued / 100)} бонусов.` : ""),
        { text: "Открыть заказ", url },
      );
    } else if (event === "shipped" && o.deliveryType === "PICKUP") {
      // Самовывоз: заказ ждёт в клубе
      const { getClub, clubMapUrl } = await import("@/lib/clubs");
      const club = await getClub(o.pickupClubId);
      const days = (await (await import("@/lib/settings")).getSettings()).delivery.pickupStorageDays;
      const until = new Date(Date.now() + days * 86400_000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" });
      await sendMail(
        o.email,
        `Заказ ${o.number} ждёт вас в клубе`,
        "Можно забирать!",
        `Заказ <b>${o.number}</b> ждёт вас${club ? ` в клубе <b>${esc(club.name)}</b>:<br>${esc(club.city)}, ${esc(club.address)}` : "."}` +
          (club?.workTime ? `<br><span style="color:#a3a3a8">${esc(club.workTime)}</span>` : "") +
          (club?.note ? `<br><span style="color:#a3a3a8">${esc(club.note)}</span>` : "") +
          `<br><br>Назовите номер заказа администратору. Заказ хранится до ${until}.` +
          (club ? `<br><br><a href="${clubMapUrl(club)}" style="color:#dcbf83">Как добраться →</a>` : ""),
        { text: "Открыть заказ", url },
      );
    } else if (event === "shipped") {
      await sendMail(
        o.email,
        `Заказ ${o.number} отправлен`,
        `Заказ ${o.number} передан в СДЭК`,
        (o.trackNumber ? `Трек-номер: <b>${o.trackNumber}</b>` : "Трек-номер появится на странице заказа.") + (o.deliveryDays ? `<br>Срок в пути: ${o.deliveryDays} дн.` : ""),
        o.trackNumber ? { text: "Отследить посылку", url: trackUrl(o.trackNumber) } : { text: "Открыть заказ", url },
      );
    } else {
      const cash = o.total - o.giftCardAmount;
      const text =
        (cash > 0 ? `Вернули ${rub(cash)} за заказ ${o.number}. Обычно деньги приходят на карту за 1–3 дня.` : `Заказ ${o.number} возвращён.`) +
        (o.giftCardAmount > 0 ? `<br>${rub(o.giftCardAmount)} вернулись на подарочный сертификат — им снова можно оплатить покупки.` : "");
      await sendMail(o.email, `Возврат по заказу ${o.number}`, cash > 0 ? "Деньги возвращены" : "Заказ возвращён", text, {
        text: "Открыть заказ",
        url,
      });
    }
  } catch (e) {
    console.error("[mail] заказ:", e instanceof Error ? e.message : e);
  }
}

/** Сообщение всем админам и менеджерам с привязанным Telegram. */
export async function notifyAdmins(html: string, button?: { text: string; url: string }) {
  void import("@/lib/push").then((m) => m.pushToStaff(m.fromHtml(html, m.sitePath(button?.url)))).catch(() => {});
  if (!telegramEnabled()) return;
  try {
    const admins = await db
      .select({ chatId: s.user.telegramChatId })
      .from(s.user)
      .where(staffWithTelegram());
    for (const a of admins) if (a.chatId) await send(a.chatId, html, button ? [button] : undefined).catch(() => {});
  } catch (e) {
    console.error("[telegram] notifyAdmins:", e instanceof Error ? e.message : e);
  }
}

/** Личное сообщение клиенту, если он привязал Telegram и не выключил уведомления. */
export async function notifyUser(userId: string, html: string, button?: { text: string; url: string }) {
  void import("@/lib/push").then((m) => m.pushToUser(userId, m.fromHtml(html, m.sitePath(button?.url)))).catch(() => {});
  if (!telegramEnabled()) return false;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, userId), columns: { telegramChatId: true, notifyTelegram: true } });
  if (!u?.telegramChatId || !u.notifyTelegram) return false;
  return send(u.telegramChatId, html, button ? [button] : undefined)
    .then(() => true)
    .catch(() => false);
}
