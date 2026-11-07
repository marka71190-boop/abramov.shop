/**
 * Смены кассы. Продавец открывает смену с разменом, продаёт, в конце пересчитывает наличные.
 * Должно быть в кассе = размен + наличные продажи смены + внесения − выемки − возвраты наличными из этой смены.
 */
import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";

export type ShiftRow = typeof s.posShift.$inferSelect;

export class ShiftError extends Error {}

export async function currentShift(sellerId: string) {
  return (await db.query.posShift.findFirst({ where: and(eq(s.posShift.sellerId, sellerId), eq(s.posShift.status, "OPEN")) })) ?? null;
}

export async function openShift(sellerId: string, p: { openingCash: number; place: string | null; clubId: string | null; staffName?: string | null }) {
  if (await currentShift(sellerId)) throw new ShiftError("Смена уже открыта");
  try {
    const [row] = await db.insert(s.posShift).values({ sellerId, openingCash: p.openingCash, place: p.place, clubId: p.clubId, staffName: p.staffName ?? null }).returning();
    return row;
  } catch {
    // Две вкладки открыли смену одновременно — уникальный индекс пропустит только одну
    throw new ShiftError("Смена уже открыта — обновите страницу");
  }
}

/** Продажи смены: наличные и безнал (оплаченные), сколько ещё ждут оплаты по QR, выемки/внесения и возвраты наличными */
export async function shiftTotals(shiftId: string) {
  const [m] = await db
    .select({ sum: sql<number>`coalesce(sum(${s.posCashMove.amount}), 0)::int` })
    .from(s.posCashMove)
    .where(eq(s.posCashMove.shiftId, shiftId));
  const [rf] = await db
    .select({ sum: sql<number>`coalesce(sum(${s.posReturn.amount}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(s.posReturn)
    .where(and(eq(s.posReturn.shiftId, shiftId), eq(s.posReturn.method, "CASH")));
  const base = await salesTotals(shiftId);
  return { ...base, moves: Number(m?.sum ?? 0), refunds: Number(rf?.sum ?? 0), refundCount: Number(rf?.n ?? 0) };
}

/** Ожидаемые наличные в кассе */
export const expectedCash = (opening: number, t: { cash: number; moves: number; refunds: number }) => opening + t.cash + t.moves - t.refunds;

async function salesTotals(shiftId: string) {
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
  const expected = expectedCash(shift.openingCash, t);
  const [row] = await db
    .update(s.posShift)
    .set({ status: "CLOSED", cashSales: t.cash, otherSales: t.other, cashMoves: t.moves, cashRefunds: t.refunds, expectedCash: expected, countedCash: counted, note, closedAt: new Date(), closedById: byId })
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
        `🧾 <b>Смена закрыта</b>${seller?.name ? ` — ${esc(seller.name)}` : ""}${shift.staffName ? ` (${esc(shift.staffName)})` : ""}${shift.place ? `, ${esc(shift.place)}` : ""}\n` +
          `Продажи: ${t.count} чек., наличные ${rub(t.cash)}, СБП и карта ${rub(t.other)}\n` +
          (t.moves ? `Выемки и внесения: ${t.moves > 0 ? "+" : "−"}${rub(Math.abs(t.moves))}\n` : "") +
          (t.refunds ? `Возвраты наличными: ${rub(t.refunds)} (${t.refundCount})\n` : "") +
          `В кассе должно быть ${rub(expected)}, пересчитали ${rub(counted)}\n` +
          (diff === 0 ? "✅ Всё сходится" : diff < 0 ? `⚠️ <b>Недостача ${rub(-diff)}</b>` : `⚠️ Излишек ${rub(diff)}`) +
          (note ? `\nКомментарий: ${esc(note)}` : ""),
      ),
    )
    .catch(() => {});
  return { shift: row, totals: t, expected, diff };
}

/** Выемка (amount < 0) или внесение (amount > 0) наличных в открытой смене */
export async function addCashMove(shiftId: string, userId: string, amount: number, reason: string | null, staffName: string | null) {
  if (!amount) throw new ShiftError("Впишите сумму");
  const shift = await db.query.posShift.findFirst({ where: eq(s.posShift.id, shiftId) });
  if (!shift || shift.status !== "OPEN") throw new ShiftError("Смена уже закрыта");
  if (amount < 0) {
    const t = await shiftTotals(shiftId);
    const inBox = expectedCash(shift.openingCash, t);
    if (-amount > inBox) throw new ShiftError(`В кассе должно быть только ${rub(inBox)} — больше забрать нельзя`);
  }
  const [row] = await db.insert(s.posCashMove).values({ shiftId, amount, reason, userId, staffName: staffName ?? shift.staffName }).returning();
  return row;
}

export async function cashMoves(shiftId: string) {
  return db.query.posCashMove.findMany({ where: eq(s.posCashMove.shiftId, shiftId), orderBy: (m, { asc }) => asc(m.createdAt) });
}

/**
 * Забытые смены: открыта дольше 14 часов или наступила ночь (после 23:00 по Москве), а её не закрыли —
 * одно напоминание сотрудникам в Telegram (без покупателей — только касса, кто на смене и сколько наличных).
 */
export async function remindOpenShifts() {
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date()));
  const cutoff = hour >= 23 || hour < 6 ? new Date(Date.now() - 60 * 60_000) : new Date(Date.now() - 14 * 3600_000);
  const rows = await db
    .select({ sh: s.posShift, seller: s.user.name })
    .from(s.posShift)
    .leftJoin(s.user, eq(s.user.id, s.posShift.sellerId))
    .where(and(eq(s.posShift.status, "OPEN"), isNull(s.posShift.remindedAt), lt(s.posShift.openedAt, cutoff)));
  if (!rows.length) return;
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const { notifyAdmins } = await import("@/lib/telegram");
  const { SITE } = await import("@/lib/site");
  for (const { sh, seller } of rows) {
    // Отметку ставим до отправки: два экземпляра сайта не напомнят дважды
    const mark = await db.update(s.posShift).set({ remindedAt: new Date() }).where(and(eq(s.posShift.id, sh.id), isNull(s.posShift.remindedAt))).returning({ id: s.posShift.id });
    if (!mark.length) continue;
    const t = await shiftTotals(sh.id);
    const since = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(sh.openedAt);
    await notifyAdmins(
      `🔔 <b>Смена не закрыта</b> — ${esc(seller ?? "касса")}${sh.staffName ? ` (${esc(sh.staffName)})` : ""}${sh.place ? `, ${esc(sh.place)}` : ""}\n` +
        `Открыта с ${since}. В кассе должно быть ${rub(expectedCash(sh.openingCash, t))}${t.pending ? `, ждут оплаты по QR: ${t.pending}` : ""}.\nПопросите закрыть смену и пересчитать наличные.`,
      { text: "Смены кассы", url: `${SITE.url}/admin/pos/shifts` },
    ).catch(() => {});
  }
}
