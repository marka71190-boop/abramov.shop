/**
 * Смены кассы. Продавец открывает смену с разменом, продаёт, в конце пересчитывает наличные.
 * Должно быть в кассе = размен + оплаченные наличными продажи этой смены.
 * Отменённые продажи не считаются: наличные за них вернули покупателю.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";

export type ShiftRow = typeof s.posShift.$inferSelect;

export class ShiftError extends Error {}

export async function currentShift(sellerId: string) {
  return (await db.query.posShift.findFirst({ where: and(eq(s.posShift.sellerId, sellerId), eq(s.posShift.status, "OPEN")) })) ?? null;
}

export async function openShift(sellerId: string, p: { openingCash: number; place: string | null; clubId: string | null }) {
  if (await currentShift(sellerId)) throw new ShiftError("Смена уже открыта");
  try {
    const [row] = await db.insert(s.posShift).values({ sellerId, openingCash: p.openingCash, place: p.place, clubId: p.clubId }).returning();
    return row;
  } catch {
    // Две вкладки открыли смену одновременно — уникальный индекс пропустит только одну
    throw new ShiftError("Смена уже открыта — обновите страницу");
  }
}

/** Продажи смены: наличные и безнал (оплаченные), сколько ещё ждут оплаты по QR */
export async function shiftTotals(shiftId: string) {
  const [r] = await db
    .select({
      cash: sql<number>`coalesce(sum(${s.posSale.total}) filter (where ${s.posSale.status} = 'PAID' and ${s.posSale.method} = 'CASH'), 0)::int`,
      other: sql<number>`coalesce(sum(${s.posSale.total}) filter (where ${s.posSale.status} = 'PAID' and ${s.posSale.method} <> 'CASH'), 0)::int`,
      count: sql<number>`(count(*) filter (where ${s.posSale.status} = 'PAID'))::int`,
      pending: sql<number>`(count(*) filter (where ${s.posSale.status} = 'PENDING'))::int`,
    })
    .from(s.posSale)
    .where(eq(s.posSale.shiftId, shiftId));
  return { cash: Number(r.cash), other: Number(r.other), count: Number(r.count), pending: Number(r.pending) };
}

export async function closeShift(shiftId: string, byId: string, counted: number, note: string | null) {
  const shift = await db.query.posShift.findFirst({ where: eq(s.posShift.id, shiftId) });
  if (!shift || shift.status !== "OPEN") throw new ShiftError("Смена уже закрыта");
  const t = await shiftTotals(shiftId);
  if (t.pending) throw new ShiftError(`Есть продажа по QR, которая ждёт оплату (${t.pending}). Дождитесь оплаты или отмените её`);
  const expected = shift.openingCash + t.cash;
  const [row] = await db
    .update(s.posShift)
    .set({ status: "CLOSED", cashSales: t.cash, otherSales: t.other, expectedCash: expected, countedCash: counted, note, closedAt: new Date(), closedById: byId })
    .where(and(eq(s.posShift.id, shiftId), eq(s.posShift.status, "OPEN")))
    .returning();
  if (!row) throw new ShiftError("Смена уже закрыта");

  // Владельцу и менеджерам — итог смены (только сотрудник и деньги, без покупателей)
  const diff = counted - expected;
  const seller = await db.query.user.findFirst({ where: eq(s.user.id, shift.sellerId), columns: { name: true } });
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  void import("@/lib/telegram")
    .then((m) =>
      m.notifyAdmins(
        `🧾 <b>Смена закрыта</b>${seller?.name ? ` — ${esc(seller.name)}` : ""}${shift.place ? `, ${esc(shift.place)}` : ""}\n` +
          `Продажи: ${t.count} чек., наличные ${rub(t.cash)}, СБП и карта ${rub(t.other)}\n` +
          `В кассе должно быть ${rub(expected)}, пересчитали ${rub(counted)}\n` +
          (diff === 0 ? "✅ Всё сходится" : diff < 0 ? `⚠️ <b>Недостача ${rub(-diff)}</b>` : `⚠️ Излишек ${rub(diff)}`) +
          (note ? `\nКомментарий: ${esc(note)}` : ""),
      ),
    )
    .catch(() => {});
  return { shift: row, totals: t, expected, diff };
}
