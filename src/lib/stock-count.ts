/**
 * Ревизия в клубе со своим учётом остатков.
 *
 * 1. Сотрудник (на телефоне кассы или менеджер в админке) начинает ревизию и сканирует товары камерой —
 *    каждое сканирование +1 шт. Считает «вслепую»: сколько должно быть, кассир не видит.
 * 2. Черновик сохраняется на сервере сам — перезагрузка телефона ничего не теряет.
 * 3. Кассир отправляет ревизию менеджеру. Менеджер видит расхождения с учётом: чего не хватает и что лишнее.
 * 4. «Провести» — остатки клуба становятся такими, как насчитали (движение «Инвентаризация»).
 *    Полный пересчёт: что не отсканировали, считается отсутствующим.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";
import { applyMoves, variantOptions, withStockNotices } from "@/lib/stock-moves";

export class CountError extends Error {}
export type CountRow = typeof s.stockCount.$inferSelect;

/** Клубы, где можно провести ревизию: свой учёт остатков; кассиру — только его клубы */
export async function countClubs(clubIds: string[] | null) {
  const rows = await db.query.club.findMany({ where: and(eq(s.club.isActive, true), eq(s.club.ownStock, true)) });
  return rows.filter((c) => !clubIds || clubIds.includes(c.id)).map((c) => ({ id: c.id, title: clubTitle(c) }));
}

/** Продолжить свою незаконченную ревизию в клубе или начать новую */
export async function openCount(userId: string, clubId: string, staffName: string | null) {
  const club = await db.query.club.findFirst({ where: eq(s.club.id, clubId) });
  if (!club?.isActive || !club.ownStock) throw new CountError("У клуба не включён свой учёт остатков — ревизия не нужна");
  const draft = await db.query.stockCount.findFirst({ where: and(eq(s.stockCount.clubId, clubId), eq(s.stockCount.createdById, userId), eq(s.stockCount.status, "DRAFT")) });
  if (draft) return draft;
  const [row] = await db.insert(s.stockCount).values({ clubId, createdById: userId, staffName: staffName?.slice(0, 80) || null }).returning();
  return row;
}

export async function getCount(id: string) {
  const r = await db
    .select({ c: s.stockCount, author: s.user.name, club: s.club })
    .from(s.stockCount)
    .innerJoin(s.club, eq(s.club.id, s.stockCount.clubId))
    .innerJoin(s.user, eq(s.user.id, s.stockCount.createdById))
    .where(eq(s.stockCount.id, String(id).slice(0, 64)))
    .limit(1);
  return r[0] ? { ...r[0].c, author: r[0].author, clubTitle: clubTitle(r[0].club) } : null;
}

const clean = (counts: Record<string, unknown>) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts).slice(0, 2000)) {
    const n = Math.trunc(Number(v));
    if (/^[\w-]{1,64}$/.test(k) && Number.isFinite(n) && n >= 0 && n <= 100_000) out[k] = n;
  }
  return out;
};

/** Сохранить насчитанное (черновик — только автор) */
export async function saveCount(id: string, userId: string, counts: Record<string, unknown>) {
  const r = await db
    .update(s.stockCount)
    .set({ counts: clean(counts), updatedAt: new Date() })
    .where(and(eq(s.stockCount.id, id), eq(s.stockCount.createdById, userId), eq(s.stockCount.status, "DRAFT")))
    .returning({ id: s.stockCount.id });
  if (!r.length) throw new CountError("Ревизия уже отправлена или закрыта — обновите страницу");
}

/** Кассир закончил: ревизия уходит менеджеру */
export async function submitCount(id: string, userId: string, p: { counts: Record<string, unknown>; full: boolean; note: string | null }) {
  const r = await db
    .update(s.stockCount)
    .set({ counts: clean(p.counts), full: p.full, note: p.note?.slice(0, 300) || null, status: "SUBMITTED", submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.stockCount.id, id), eq(s.stockCount.createdById, userId), eq(s.stockCount.status, "DRAFT")))
    .returning();
  if (!r.length) throw new CountError("Ревизия уже отправлена или закрыта — обновите страницу");
  const c = await getCount(id);
  if (c) {
    const n = Object.values(r[0].counts).reduce((a, x) => a + x, 0);
    void import("@/lib/telegram")
      .then((t) => t.notifyAdmins(`📋 Ревизия в клубе ${c.clubTitle} готова к проверке: насчитали ${n} шт. Считал(а): ${c.staffName ?? c.author}. Админка → Склад → Ревизии.`))
      .catch(() => {});
    void import("@/lib/push")
      .then((m) => m.pushToStaff({ title: "Ревизия ждёт проверки", body: `${c.clubTitle} · ${n} шт`, url: `/admin/stock/count/${id}`, tag: `count-${id}` }))
      .catch(() => {});
  }
  return r[0];
}

export interface DiffLine {
  variantId: string;
  name: string;
  sku: string | null;
  expected: number; // по учёту
  counted: number | null; // насчитали; null — не сканировали
  diff: number; // насчитали − учёт (при полном пересчёте несчитанные — 0)
  cost: number | null;
}

/** Сверка с учётом на сейчас */
export async function countDiff(c: Pick<CountRow, "clubId" | "counts" | "full">) {
  const opts = await variantOptions(c.clubId);
  const byId = new Map(opts.map((o) => [o.id, o]));
  const lines: DiffLine[] = [];
  for (const o of opts) {
    const counted = c.counts[o.id] ?? null;
    if (counted == null && o.stock <= 0) continue;
    const real = counted ?? (c.full ? 0 : o.stock);
    lines.push({ variantId: o.id, name: o.name, sku: o.sku, expected: o.stock, counted, diff: real - o.stock, cost: o.cost });
  }
  // Отсканировали то, чего уже нет в каталоге (выключили вариант) — показываем, но провести нельзя
  for (const id of Object.keys(c.counts)) if (!byId.has(id)) lines.push({ variantId: id, name: "Товар снят с продажи", sku: null, expected: 0, counted: c.counts[id], diff: 0, cost: null });
  lines.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name, "ru"));
  const minus = lines.filter((l) => l.diff < 0);
  const plus = lines.filter((l) => l.diff > 0);
  return {
    lines,
    minusQty: -minus.reduce((a, l) => a + l.diff, 0),
    minusCost: -minus.reduce((a, l) => a + l.diff * (l.cost ?? 0), 0),
    plusQty: plus.reduce((a, l) => a + l.diff, 0),
    counted: Object.values(c.counts).reduce((a, x) => a + x, 0),
  };
}

/** Менеджер проводит: остатки клуба = насчитанному */
export async function applyCount(id: string, userId: string, full: boolean) {
  const c = await getCount(id);
  if (!c) throw new CountError("Ревизия не найдена");
  if (c.status !== "SUBMITTED" && c.status !== "DRAFT") throw new CountError("Ревизия уже проведена или отменена");
  const d = await countDiff({ ...c, full });
  const lines = d.lines.filter((l) => l.diff !== 0).map((l) => ({ variantId: l.variantId, qty: l.expected + l.diff }));
  // Сначала помечаем — второй раз провести нельзя, даже при двойном нажатии
  const lock = await db
    .update(s.stockCount)
    .set({ status: "APPLIED", full, appliedAt: new Date(), appliedById: userId, updatedAt: new Date(), result: { lines: lines.length, plus: d.plusQty, minus: d.minusQty, minusCost: d.minusCost } })
    .where(and(eq(s.stockCount.id, c.id), inArray(s.stockCount.status, ["SUBMITTED", "DRAFT"])))
    .returning({ id: s.stockCount.id });
  if (!lock.length) throw new CountError("Ревизия уже проведена");
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(c.createdAt);
  try {
    if (lines.length)
      await withStockNotices(
        lines.map((l) => l.variantId),
        () => applyMoves(userId, "INVENTORY", lines, `Ревизия ${date}${c.staffName ? ` · считал(а) ${c.staffName}` : ""}`, c.clubId),
      );
  } catch (e) {
    await db.update(s.stockCount).set({ status: c.status, appliedAt: null, appliedById: null, result: null }).where(eq(s.stockCount.id, c.id));
    throw e;
  }
  return { lines: lines.length, plus: d.plusQty, minus: d.minusQty, minusCost: d.minusCost };
}

/** Отменить: черновик — автор или менеджер; отправленную — менеджер */
export async function cancelCount(id: string, userId: string, manager: boolean) {
  await db
    .update(s.stockCount)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(eq(s.stockCount.id, id), manager ? inArray(s.stockCount.status, ["DRAFT", "SUBMITTED"]) : and(eq(s.stockCount.createdById, userId), eq(s.stockCount.status, "DRAFT"))));
}

/** Ревизии для списка в админке */
export async function listCounts(limit = 50) {
  const rows = await db
    .select({ c: s.stockCount, author: s.user.name, club: s.club })
    .from(s.stockCount)
    .innerJoin(s.club, eq(s.club.id, s.stockCount.clubId))
    .innerJoin(s.user, eq(s.user.id, s.stockCount.createdById))
    .orderBy(desc(s.stockCount.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.c, author: r.author, clubTitle: clubTitle(r.club) }));
}

export const COUNT_STATUS: Record<string, string> = {
  DRAFT: "Считают",
  SUBMITTED: "Ждёт проверки",
  APPLIED: "Проведена",
  CANCELLED: "Отменена",
};
