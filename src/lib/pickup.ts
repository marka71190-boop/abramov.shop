/**
 * Выдача заказов с сайта в клубе (самовывоз): кассир клуба видит заказы своего клуба,
 * находит по номеру (покупатель показывает его на странице заказа — там и QR) и отмечает «Выдано».
 * Заказ становится «Получен»: начисляются бонусы, покупателю уходит письмо.
 * Кассиру показываем имя покупателя и последние цифры телефона — для сверки, не больше.
 */
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { clubTitle } from "@/lib/club-label";
import { markDelivered, OrderError } from "@/lib/orders";

export class PickupError extends Error {}

const WAITING = ["PAID", "ASSEMBLING", "SHIPPED"] as const;

export interface PickupView {
  id: string;
  number: string;
  status: string; // PAID, ASSEMBLING — ещё собирают; SHIPPED — готов к выдаче; DELIVERED — выдан
  ready: boolean;
  club: string;
  customer: string; // имя
  phoneTail: string | null; // ••-45
  items: { name: string; qty: number }[];
  total: number;
  createdAt: string;
}

function view(o: typeof s.order.$inferSelect & { items: (typeof s.orderItem.$inferSelect)[] }, clubs: Map<string, string>): PickupView {
  const digits = (o.phone ?? "").replace(/\D/g, "");
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    ready: o.status === "SHIPPED",
    club: (o.pickupClubId && clubs.get(o.pickupClubId)) || "—",
    customer: (o.customerName ?? "").trim().split(/\s+/).slice(0, 2).join(" "),
    phoneTail: digits.length >= 4 ? `••-${digits.slice(-4, -2)}-${digits.slice(-2)}` : null,
    items: o.items.map((i) => ({ name: i.name, qty: i.quantity })),
    total: o.total,
    createdAt: o.createdAt.toISOString(),
  };
}

async function clubNames() {
  const rows = await db.select({ id: s.club.id, name: s.club.name, address: s.club.address }).from(s.club);
  return new Map(rows.map((c) => [c.id, clubTitle(c)]));
}

/** Заказы, которые ждут выдачи в клубах кассира (null — все клубы, для админа) */
export async function pickupQueue(clubIds: string[] | null) {
  const rows = await db.query.order.findMany({
    where: and(
      eq(s.order.deliveryType, "PICKUP"),
      inArray(s.order.status, [...WAITING]),
      clubIds ? (clubIds.length ? inArray(s.order.pickupClubId, clubIds) : sql`false`) : undefined,
    ),
    with: { items: true },
    orderBy: desc(s.order.createdAt),
    limit: 100,
  });
  const names = await clubNames();
  return rows.map((o) => view(o, names));
}

/** Найти заказ по номеру (набрали или отсканировали QR со страницы заказа) */
export async function findPickup(raw: string, clubIds: string[] | null) {
  const number = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^.*\/ORDER\//, "") // отсканировали ссылку на страницу заказа
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  if (number.length < 6) throw new PickupError("Номер заказа — как в письме: AS-261110-ABCD");
  const o = await db.query.order.findFirst({ where: eq(s.order.number, number), with: { items: true } });
  if (!o) throw new PickupError(`Заказ ${number} не найден`);
  if (o.deliveryType !== "PICKUP") throw new PickupError(`Заказ ${number} — не самовывоз из клуба`);
  if (clubIds && (!o.pickupClubId || !clubIds.includes(o.pickupClubId))) throw new PickupError(`Заказ ${number} — для выдачи в другом клубе`);
  if (o.status === "AWAITING_PAYMENT") throw new PickupError(`Заказ ${number} ещё не оплачен — выдавать нельзя`);
  if (o.status === "CANCELLED" || o.status === "REFUNDED") throw new PickupError(`Заказ ${number} отменён`);
  return view(o, await clubNames());
}

/** Выдать: заказ «Получен», бонусы покупателю, письмо */
export async function issuePickup(orderId: string, actorId: string, staffName: string | null, clubIds: string[] | null) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, String(orderId).slice(0, 64)) });
  if (!o || o.deliveryType !== "PICKUP") throw new PickupError("Заказ не найден");
  if (clubIds && (!o.pickupClubId || !clubIds.includes(o.pickupClubId))) throw new PickupError("Этот заказ выдают в другом клубе");
  if (o.status === "DELIVERED") throw new PickupError(`Заказ ${o.number} уже выдан`);
  if (!WAITING.includes(o.status as (typeof WAITING)[number])) throw new PickupError(`Заказ ${o.number} нельзя выдать: он ${o.status === "AWAITING_PAYMENT" ? "не оплачен" : "отменён"}`);
  try {
    await markDelivered(o.id, actorId);
  } catch (e) {
    throw new PickupError(e instanceof OrderError ? e.message : "Не получилось отметить выдачу");
  }
  await audit(actorId, "order.pickup_issued", "order", o.id, { number: o.number, ...(staffName ? { staff: staffName } : {}) });
  return o.number;
}
