/**
 * Продажи сотрудников за месяц: кто сколько продал в кассе (товары, без сертификатов), сколько вернули,
 * смены и часы, процент с продаж. Сотрудник — «кто на смене» (общий телефон кассы) или аккаунт кассира.
 */
import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";

export interface StaffRow {
  key: string;
  name: string;
  account: string | null; // аккаунт, если на смене был другой человек (общий телефон)
  clubs: string[];
  shifts: number;
  hours: number;
  checks: number;
  sold: number; // продали товара (после скидки, включая оплату бонусами и сертификатом), копейки
  returned: number; // вернули покупателям, копейки
  net: number; // sold − returned
  gifts: number; // продали сертификатов, копейки (в процент не входит)
}

/** Границы месяца по Москве: «2026-11» */
export function monthRange(m: string) {
  const [y, mo] = /^\d{4}-\d{2}$/.test(m) ? m.split("-").map(Number) : [0, 0];
  const now = new Date(Date.now() + 3 * 3600_000);
  const yy = y || now.getUTCFullYear();
  const mm = mo || now.getUTCMonth() + 1;
  const from = new Date(`${yy}-${String(mm).padStart(2, "0")}-01T00:00:00+03:00`);
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const to = new Date(`${next}-01T00:00:00+03:00`);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  return { from, to, key: `${yy}-${String(mm).padStart(2, "0")}`, prev, next, label: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(from) };
}

export async function staffReport(m: string) {
  const r = monthRange(m);
  const [clubs, shifts, sales, returns] = await Promise.all([
    db.select({ id: s.club.id, name: s.club.name, address: s.club.address }).from(s.club),
    db
      .select({ x: s.posShift, seller: s.user.name })
      .from(s.posShift)
      .leftJoin(s.user, eq(s.user.id, s.posShift.sellerId))
      .where(and(gte(s.posShift.openedAt, r.from), lt(s.posShift.openedAt, r.to))),
    db
      .select({ x: s.posSale, seller: s.user.name, staff: s.posShift.staffName })
      .from(s.posSale)
      .leftJoin(s.user, eq(s.user.id, s.posSale.sellerId))
      .leftJoin(s.posShift, eq(s.posShift.id, s.posSale.shiftId))
      .where(and(eq(s.posSale.status, "PAID"), gte(s.posSale.paidAt, r.from), lt(s.posSale.paidAt, r.to))),
    db
      .select({ x: s.posReturn, seller: s.user.name, staff: s.posShift.staffName })
      .from(s.posReturn)
      .innerJoin(s.posSale, eq(s.posSale.id, s.posReturn.saleId))
      .leftJoin(s.user, eq(s.user.id, s.posSale.sellerId))
      .leftJoin(s.posShift, eq(s.posShift.id, s.posSale.shiftId))
      .where(and(gte(s.posReturn.createdAt, r.from), lt(s.posReturn.createdAt, r.to))),
  ]);
  const clubName = new Map(clubs.map((c) => [c.id, clubTitle(c)]));
  const rows = new Map<string, StaffRow>();
  const row = (seller: string | null, staff: string | null | undefined) => {
    const name = (staff || seller || "Удалённый аккаунт").trim();
    const key = name.toLowerCase().replace(/ё/g, "е");
    let x = rows.get(key);
    if (!x) {
      x = { key, name, account: staff && seller && staff !== seller ? seller : null, clubs: [], shifts: 0, hours: 0, checks: 0, sold: 0, returned: 0, net: 0, gifts: 0 };
      rows.set(key, x);
    }
    return x;
  };
  for (const { x, seller } of shifts) {
    const w = row(seller, x.staffName);
    w.shifts++;
    const end = x.closedAt ?? (x.status === "OPEN" ? new Date() : x.openedAt);
    w.hours += Math.max(0, (+end - +x.openedAt) / 3600_000);
    const c = x.clubId ? clubName.get(x.clubId) : x.place;
    if (c && !w.clubs.includes(c)) w.clubs.push(c);
  }
  for (const { x, seller, staff } of sales) {
    const w = row(seller, staff);
    if (x.kind === "GIFT") {
      w.gifts += x.total;
      continue;
    }
    w.checks++;
    w.sold += x.subtotal - x.discount;
  }
  for (const { x, seller, staff } of returns) {
    const w = row(seller, staff);
    w.returned += x.amount + x.bonusBack + x.giftBack;
  }
  const list = [...rows.values()].map((w) => ({ ...w, hours: Math.round(w.hours * 10) / 10, net: w.sold - w.returned })).sort((a, b) => b.net - a.net);
  return { range: r, rows: list };
}
