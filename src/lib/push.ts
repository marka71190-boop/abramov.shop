/**
 * Уведомления на телефон и компьютер (Web Push) — для тех, кто установил сайт как приложение или разрешил уведомления.
 *
 * Ключи VAPID: можно задать в Timeweb (VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY), иначе выводятся из BETTER_AUTH_SECRET —
 * ничего настраивать не нужно. Если BETTER_AUTH_SECRET поменяют, старые подписки перестанут работать и люди включат уведомления заново.
 *
 * Сообщение шифруется в браузер покупателя (RFC 8291): служба уведомлений (Google, Apple, Mozilla) его не читает.
 * И всё равно — без персональных данных: номер заказа, статус, трек, сумма.
 */
import "server-only";
import { createECDH, hkdfSync } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import webpush from "web-push";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";

const b64url = (b: Buffer) => b.toString("base64url");

let keys: { publicKey: string; privateKey: string } | null | undefined;

export function vapidKeys() {
  if (keys !== undefined) return keys;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return (keys = { publicKey: pub, privateKey: priv });
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 16) return (keys = null);
  for (let i = 0; i < 16; i++) {
    const d = Buffer.from(hkdfSync("sha256", secret, "abramov.shop", `vapid-p256-${i}`, 32));
    const ecdh = createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(d);
    } catch {
      continue; // число вне допустимого диапазона кривой — берём следующее
    }
    return (keys = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(d) });
  }
  return (keys = null);
}

export const pushEnabled = () => !!vapidKeys();
export const pushPublicKey = () => vapidKeys()?.publicKey ?? null;

/**
 * Куда браузеру разрешено слать: только службы уведомлений браузеров.
 * Иначе вошедший пользователь мог бы заставить сервер ходить по внутренним адресам.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname)) && endpoint.length <= 1000;
  } catch {
    return false;
  }
}

export interface PushMessage {
  title: string;
  body?: string;
  /** Адрес на сайте, который откроется по нажатию */
  url?: string;
  /** Одинаковый tag заменяет предыдущее уведомление (например, по одному заказу) */
  tag?: string;
}

/** Отправить на все устройства этих пользователей. Мёртвые подписки удаляем. Ошибки не ломают работу магазина */
export async function pushToUsers(userIds: string[], msg: PushMessage) {
  const k = vapidKeys();
  if (!k || !userIds.length) return 0;
  try {
    const subs = await db.select().from(s.pushSubscription).where(inArray(s.pushSubscription.userId, [...new Set(userIds)]));
    if (!subs.length) return 0;
    const payload = JSON.stringify({
      title: msg.title.slice(0, 120),
      body: (msg.body ?? "").slice(0, 300),
      url: msg.url && msg.url.startsWith("/") && !msg.url.startsWith("//") ? msg.url : "/",
      tag: msg.tag,
    });
    const opts = { vapidDetails: { subject: SITE.url.startsWith("https://") ? SITE.url : "https://abramov.shop", ...k }, TTL: 24 * 3600, timeout: 10_000 };
    let ok = 0;
    await Promise.all(
      subs.map(async (sub) => {
        if (!allowedEndpoint(sub.endpoint)) {
          await db.delete(s.pushSubscription).where(eq(s.pushSubscription.id, sub.id));
          return;
        }
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, opts);
          ok++;
          await db.update(s.pushSubscription).set({ failures: 0, lastSentAt: new Date() }).where(eq(s.pushSubscription.id, sub.id));
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410 || code === 403 || sub.failures >= 9) {
            // Подписка больше не действует (удалили приложение, сбросили разрешение)
            await db.delete(s.pushSubscription).where(eq(s.pushSubscription.id, sub.id));
          } else {
            await db
              .update(s.pushSubscription)
              .set({ failures: sql`${s.pushSubscription.failures} + 1` })
              .where(eq(s.pushSubscription.id, sub.id));
            console.error("[push]", code ?? (e instanceof Error ? e.message : e));
          }
        }
      }),
    );
    return ok;
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
    return 0;
  }
}

export const pushToUser = (userId: string, msg: PushMessage) => pushToUsers([userId], msg);

/** Владелец и менеджеры (не заблокированные) */
export async function pushToStaff(msg: PushMessage) {
  const staff = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(
      and(
        inArray(s.user.role, ["OWNER", "MANAGER"]),
        or(isNull(s.user.bannedAt), and(sql`${s.user.bannedUntil} is not null`, lt(s.user.bannedUntil, new Date()))),
      ),
    );
  return pushToUsers(
    staff.map((x) => x.id),
    msg,
  );
}

/** Текст из HTML-сообщения для Telegram: без тегов, первая строка — заголовок */
export function fromHtml(html: string, url?: string, tag?: string): PushMessage {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  const [first, ...rest] = text.split("\n");
  return { title: first.trim() || SITE.name, body: rest.join(" ").replace(/\s+/g, " ").trim(), url, tag };
}

/** Ссылку на наш сайт из кнопки Telegram превращаем в путь: /order/A-1001 */
export function sitePath(url?: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url, SITE.url);
    return u.origin === new URL(SITE.url).origin ? u.pathname + u.search + u.hash : undefined;
  } catch {
    return undefined;
  }
}

type OrderEvent = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";

/** Покупателю — о его заказе; сотрудникам — о новом оплаченном заказе. Без имён, телефонов и адресов */
export async function pushOrder(orderId: string, event: OrderEvent) {
  if (!pushEnabled()) return;
  try {
    const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: { columns: { name: true, quantity: true } } } });
    if (!o) return;
    const { rub } = await import("@/lib/format");
    const pickup = o.deliveryType === "PICKUP";
    const url = `/order/${o.number}`;
    const msg: Record<OrderEvent, PushMessage> = {
      paid: { title: `Заказ ${o.number} оплачен`, body: pickup ? "Соберём и сообщим, когда можно забирать в клубе." : "Соберём и пришлём трек-номер СДЭК." },
      shipped: pickup
        ? { title: `Заказ ${o.number} ждёт вас в клубе`, body: "Назовите номер заказа администратору." }
        : { title: `Заказ ${o.number} передан в СДЭК`, body: o.trackNumber ? `Трек-номер ${o.trackNumber}${o.deliveryDays ? `, в пути ~${o.deliveryDays} дн.` : ""}` : "Трек-номер — на странице заказа." },
      delivered: { title: `Заказ ${o.number} получен — спасибо!`, body: o.bonusAccrued ? `Начислили ${Math.floor(o.bonusAccrued / 100)} бонусов. Оставьте отзыв о покупке.` : "Оставьте отзыв о покупке." },
      cancelled: { title: `Заказ ${o.number} отменён`, body: "Подробности — на странице заказа." },
      refunded: { title: `Возврат по заказу ${o.number}`, body: o.total > o.giftCardAmount ? `Вернули ${rub(o.total - o.giftCardAmount)}. Обычно деньги приходят за 1–3 дня.` : "Заказ возвращён." },
    };
    if (o.userId) await pushToUser(o.userId, { ...msg[event], url, tag: `order-${o.number}` });
    if (event === "paid") {
      const items = o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ");
      await pushToStaff({ title: `Новый заказ ${o.number} — ${rub(o.total)}`, body: `${pickup ? "Самовывоз" : "СДЭК"}${o.city ? `, ${o.city}` : ""}. ${items}`, url: `/admin/orders/${o.id}`, tag: `admin-order-${o.number}` });
    }
  } catch (e) {
    console.error("[push] заказ:", e instanceof Error ? e.message : e);
  }
}
