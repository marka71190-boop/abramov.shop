/**
 * Отчёт по кассе для контроля: скидки, запросы подтверждения, возвраты и недостачи —
 * по каждому, кто продаёт (аккаунт + кто на смене), и по менеджерам, которые подтверждали.
 * Без данных покупателей: только суммы, чеки, сотрудники и клубы.
 */
import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";

export interface WhoRow {
  key: string;
  seller: string;
  staff: string | null;
  clubs: string[]; // где работал за период
  sales: number;
  revenue: number; // к оплате, копейки
  subtotal: number; // по ценам товаров
  discounted: number; // чеков со скидкой
  discount: number; // скидок всего
  overLimit: number; // чеков со скидкой сверх лимита (подтверждал менеджер)
  overLimitSum: number;
  returns: number;
  returnSum: number;
  requests: number; // запросов подтверждения
  approved: number;
  denied: number;
  lapsed: number; // не дождались: время вышло или отменили
  shifts: number; // закрытых смен
  shortage: number; // недостача по сменам (≤ 0), копейки
}

export interface ApproverRow {
  name: string;
  approved: number;
  denied: number;
  discountSum: number; // одобренных скидок, копейки
  returnSum: number; // одобренных возвратов, копейки
}

export async function posReport(days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const seller = alias(s.user, "seller");
  const approver = alias(s.user, "approver");
  const [clubs, sales, returns, approvals, shifts] = await Promise.all([
    db.select({ id: s.club.id, name: s.club.name, address: s.club.address }).from(s.club),
    db
      .select({ x: s.posSale, seller: seller.name, staff: s.posShift.staffName })
      .from(s.posSale)
      .leftJoin(seller, eq(seller.id, s.posSale.sellerId))
      .leftJoin(s.posShift, eq(s.posShift.id, s.posSale.shiftId))
      .where(and(eq(s.posSale.status, "PAID"), gte(s.posSale.createdAt, since))),
    db
      .select({ x: s.posReturn, seller: seller.name, staff: s.posShift.staffName, clubId: s.posSale.clubId, place: s.posSale.place })
      .from(s.posReturn)
      .innerJoin(s.posSale, eq(s.posSale.id, s.posReturn.saleId))
      .leftJoin(seller, eq(seller.id, s.posReturn.sellerId))
      .leftJoin(s.posShift, eq(s.posShift.id, s.posReturn.shiftId))
      .where(gte(s.posReturn.createdAt, since)),
    db
      .select({ x: s.posApproval, seller: seller.name, approver: approver.name })
      .from(s.posApproval)
      .leftJoin(seller, eq(seller.id, s.posApproval.sellerId))
      .leftJoin(approver, eq(approver.id, s.posApproval.approverId))
      .where(gte(s.posApproval.createdAt, since))
      .orderBy(desc(s.posApproval.createdAt)),
    db
      .select({ x: s.posShift, seller: seller.name })
      .from(s.posShift)
      .leftJoin(seller, eq(seller.id, s.posShift.sellerId))
      .where(and(eq(s.posShift.status, "CLOSED"), gte(s.posShift.openedAt, since))),
  ]);
  const clubName = new Map(clubs.map((c) => [c.id, clubTitle(c)]));
  const where = (clubId: string | null | undefined, place: string | null | undefined) => (clubId && clubName.get(clubId)) || place || "—";

  const who = new Map<string, WhoRow>();
  const row = (sellerName: string | null, staff: string | null | undefined, club: string) => {
    const name = sellerName ?? "Удалённый аккаунт";
    const key = `${name}\u0000${staff ?? ""}`;
    let r = who.get(key);
    if (!r) {
      r = { key, seller: name, staff: staff || null, clubs: [], sales: 0, revenue: 0, subtotal: 0, discounted: 0, discount: 0, overLimit: 0, overLimitSum: 0, returns: 0, returnSum: 0, requests: 0, approved: 0, denied: 0, lapsed: 0, shifts: 0, shortage: 0 };
      who.set(key, r);
    }
    if (club !== "—" && !r.clubs.includes(club)) r.clubs.push(club);
    return r;
  };

  for (const { x, seller: name, staff } of sales) {
    const r = row(name, staff, where(x.clubId, x.place));
    r.sales++;
    r.revenue += x.total;
    r.subtotal += x.subtotal;
    if (x.discount > 0) {
      r.discounted++;
      r.discount += x.discount;
    }
    if (x.discountById) {
      r.overLimit++;
      r.overLimitSum += x.discount;
    }
  }
  for (const { x, seller: name, staff, clubId, place } of returns) {
    const r = row(name, staff, where(clubId, place));
    r.returns++;
    r.returnSum += x.amount;
  }
  for (const { x, seller: name } of shifts) {
    const r = row(name, x.staffName, where(x.clubId, x.place));
    r.shifts++;
    r.shortage += Math.min(0, (x.countedCash ?? 0) - (x.expectedCash ?? 0));
  }

  const appr = new Map<string, ApproverRow>();
  for (const { x, seller: name, approver: aName } of approvals) {
    const d = x.details;
    // Клуб у запроса — подпись смены; не дублируем, если человек уже есть с продажами
    const r = row(name, d.staffName, who.has(`${name ?? "Удалённый аккаунт"}\u0000${d.staffName ?? ""}`) ? "—" : d.place || "—");
    r.requests++;
    const ok = x.status === "APPROVED" || x.status === "USED";
    if (ok) r.approved++;
    else if (x.status === "DENIED") r.denied++;
    else if (x.status !== "PENDING" || x.expiresAt < new Date()) r.lapsed++;
    const a = appr.get(aName ?? "—") ?? { name: aName ?? "—", approved: 0, denied: 0, discountSum: 0, returnSum: 0 };
    if (ok) {
      a.approved++;
      if (x.kind === "DISCOUNT") a.discountSum += d.discount ?? 0;
      else a.returnSum += d.total;
    } else if (x.status === "DENIED") a.denied++;
    appr.set(a.name, a);
  }

  const rows = [...who.values()].sort((a, b) => b.discount + b.returnSum - b.shortage - (a.discount + a.returnSum - a.shortage) || b.sales - a.sales);
  const totals = rows.reduce(
    (t, r) => ({
      sales: t.sales + r.sales,
      subtotal: t.subtotal + r.subtotal,
      discount: t.discount + r.discount,
      overLimitSum: t.overLimitSum + r.overLimitSum,
      returnSum: t.returnSum + r.returnSum,
      shortage: t.shortage + r.shortage,
      requests: t.requests + r.requests,
      denied: t.denied + r.denied,
    }),
    { sales: 0, subtotal: 0, discount: 0, overLimitSum: 0, returnSum: 0, shortage: 0, requests: 0, denied: 0 },
  );

  return {
    rows,
    totals,
    approvers: [...appr.values()].sort((a, b) => b.approved - a.approved),
    recent: approvals.slice(0, 40).map(({ x, seller: name, approver: aName }) => ({
      id: x.id,
      at: x.createdAt,
      kind: x.kind,
      summary: x.summary,
      status: x.status === "PENDING" && x.expiresAt < new Date() ? "EXPIRED" : x.status,
      seller: name ?? "—",
      staff: x.details.staffName ?? null,
      place: x.details.place ?? null,
      approver: aName ?? "—",
    })),
  };
}

/** Доля скидки от суммы чеков, % с одним знаком */
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
