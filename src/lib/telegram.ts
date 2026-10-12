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
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { trackUrl } from "@/lib/cdek";
import { num, prettyPhone, rub } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/order-status";
import { SITE } from "@/lib/site";

const API = () => `${process.env.TELEGRAM_API_URL || "https://api.telegram.org"}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;

/** Секрет для заголовка вебхука — выводится из BETTER_AUTH_SECRET, отдельная переменная не нужна. */
export const webhookSecret = () =>
  createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET ?? ""}:telegram`)
    .digest("hex")
    .slice(0, 48);

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}

let me: { username: string } | null = null;
export async function botUsername(): Promise<string | null> {
  if (!telegramEnabled()) return null;
  if (me) return me.username;
  try {
    me = await call<{ username: string }>("getMe", {});
    return me.username;
  } catch (e) {
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

/** Регистрирует вебхук. Вызывается при старте сайта. */
export async function setupWebhook() {
  if (!telegramEnabled()) return;
  const base = (process.env.BETTER_AUTH_URL || SITE.url).replace(/\/$/, "");
  await call("setWebhook", {
    url: `${base}/api/telegram/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  await call("setMyCommands", {
    commands: [
      { command: "orders", description: "Мои заказы" },
      { command: "bonus", description: "Мои бонусы" },
      { command: "help", description: "Помощь" },
    ],
  }).catch(() => {});
  console.log(`[telegram] Бот @${await botUsername()} подключён, вебхук: ${base}/api/telegram/webhook`);
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
        return send(
          chatId,
          `Готово, ${esc(user.name.split(" ")[0])}! Telegram привязан к аккаунту Abramov Shop.\n\n` +
            `Сюда придут оплата, трек-номер СДЭК и вручение заказа, а ещё начисление бонусов.` +
            (admin ? `\n\n<b>Вы админ</b> — сюда же будут приходить новые оплаченные заказы.` : "") +
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
        `<b>${o.number}</b> — ${ORDER_STATUS[o.status].text}, ${rub(o.total)}` +
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

/** Сообщение клиенту и (для оплаты) админам. Ошибки Telegram не ломают работу магазина. */
export async function notifyOrder(orderId: string, event: OrderEvent, extra?: { note?: string }) {
  if (!telegramEnabled()) return;
  try {
    const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true, user: true } });
    if (!o) return;
    const site = SITE.url;
    const link = { text: "Открыть заказ", url: `${site}/order/${o.number}` };
    const u = o.user;

    if (u?.telegramChatId && u.notifyTelegram) {
      const msg: Record<OrderEvent, string> = {
        paid: `✅ Заказ <b>${o.number}</b> оплачен — ${rub(o.total)}.\nСоберём и пришлём трек-номер СДЭК.`,
        shipped:
          `📦 Заказ <b>${o.number}</b> передан в СДЭК.` +
          (o.trackNumber ? `\nТрек: <a href="${trackUrl(o.trackNumber)}">${o.trackNumber}</a>` : "") +
          (o.deliveryDays ? `\nСрок в пути: ${o.deliveryDays} дн.` : ""),
        delivered:
          `🎉 Заказ <b>${o.number}</b> получен. Спасибо!` + (o.bonusAccrued ? `\nНачислено <b>${num(o.bonusAccrued / 100)}</b> бонусов.` : ""),
        cancelled: `Заказ <b>${o.number}</b> отменён${o.cancelReason ? `: ${esc(o.cancelReason.toLowerCase())}` : ""}. Товар вернулся в продажу.`,
        refunded: `Деньги за заказ <b>${o.number}</b> возвращены — ${rub(o.total)}. Обычно они приходят на карту за 1–3 дня.`,
      };
      await send(u.telegramChatId, msg[event], o.trackNumber && event === "shipped" ? [{ text: "Отследить", url: trackUrl(o.trackNumber) }, link] : [link]).catch(
        (e) => console.error("[telegram] клиенту:", e.message),
      );
    }

    if (event === "paid") {
      const admins = await db
        .select({ chatId: s.user.telegramChatId })
        .from(s.user)
        .where(and(inArray(s.user.role, ["OWNER", "MANAGER"]), isNotNull(s.user.telegramChatId)));
      const items = o.items.map((i) => `• ${esc(i.name)} × ${i.quantity}`).join("\n");
      const text =
        `🛒 <b>Новый заказ ${o.number}</b> — ${rub(o.total)}\n` +
        `${esc(o.customerName)}, ${prettyPhone(o.phone)}\n` +
        `${o.deliveryType === "COURIER" ? "Курьер" : "ПВЗ"}: ${esc([o.city, o.address].filter(Boolean).join(", "))}\n\n${items}` +
        (o.comment ? `\n\n💬 ${esc(o.comment)}` : "") +
        (extra?.note || o.cancelReason ? `\n\n⚠️ ${esc(extra?.note ?? o.cancelReason ?? "")}` : "");
      for (const a of admins) {
        if (a.chatId) await send(a.chatId, text, [{ text: "Открыть в админке", url: `${site}/admin/orders/${o.id}` }]).catch((e) => console.error("[telegram] админу:", e.message));
      }
    }
  } catch (e) {
    console.error("[telegram] notifyOrder:", e instanceof Error ? e.message : e);
  }
}
