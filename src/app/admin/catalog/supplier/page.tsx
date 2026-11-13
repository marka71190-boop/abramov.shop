import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { attrValues, listAttributes } from "@/lib/attributes";
import { fortuLink, planFor, SURE } from "@/lib/fortu";
import { num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { SearchRunner, SupplierTable, type Row } from "./SupplierTable";

export const metadata: Metadata = { title: "Заполнение по поставщику" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "found", label: "Нашли — проверить", status: "FOUND" },
  { key: "none", label: "Не нашли", status: "NONE" },
  { key: "applied", label: "Заполнено", status: "APPLIED" },
  { key: "skip", label: "Пропущены", status: "SKIP" },
] as const;

/** Заполнение карточек по сайту поставщика: характеристики — оттуда, описание пишет свой генератор */
export default async function SupplierPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.f) ?? TABS[0];
  const q = (sp.q ?? "").trim().slice(0, 80);

  const [counts, [{ total, todo }]] = await Promise.all([
    db.select({ status: s.supplierCard.status, n: sql<number>`count(*)::int` }).from(s.supplierCard).groupBy(s.supplierCard.status),
    db
      .select({ total: sql<number>`count(*)::int`, todo: sql<number>`count(*) filter (where ${isNull(s.supplierCard.productId)})::int` })
      .from(s.product)
      .leftJoin(s.supplierCard, eq(s.supplierCard.productId, s.product.id)),
  ]);
  const count = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;

  const list = await db
    .select({
      id: s.product.id,
      name: s.product.name,
      description: s.product.description,
      categoryId: s.product.categoryId,
      weightGrams: s.product.weightGrams,
      url: s.supplierCard.url,
      title: s.supplierCard.title,
      code: s.supplierCard.code,
      score: s.supplierCard.score,
      specs: s.supplierCard.specs,
      note: s.supplierCard.note,
    })
    .from(s.supplierCard)
    .innerJoin(s.product, eq(s.product.id, s.supplierCard.productId))
    .where(and(eq(s.supplierCard.status, tab.status), q ? ilike(s.product.name, `%${q.replace(/[%_\\]/g, "")}%`) : undefined))
    .orderBy(sql`${s.supplierCard.score} desc`, asc(s.product.name))
    .limit(150);

  const withPlan = tab.status === "FOUND" || tab.status === "APPLIED";
  const [attrs, vals, cats] = withPlan
    ? await Promise.all([listAttributes(), attrValues(list.map((r) => r.id)), db.select({ id: s.category.id, name: s.category.name, slug: s.category.slug }).from(s.category).where(inArray(s.category.id, [...new Set(list.map((r) => r.categoryId).filter((x): x is string => !!x)), ""]))])
    : [[], new Map<string, Map<string, string>>(), []];

  const rows: Row[] = list.map((r) => {
    const plan = withPlan ? planFor(r, cats.find((c) => c.id === r.categoryId) ?? null, r.specs, attrs, vals.get(r.id) ?? new Map()) : null;
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      link: r.url ? fortuLink(r.url) : null,
      code: r.code,
      score: r.score,
      note: r.note,
      attrs: plan?.attrs.map((a) => `${a.name}: ${a.show}`) ?? [],
      description: plan?.description ?? "",
      hasDescription: plan?.hasDescription ?? false,
      weight: plan?.weightGrams ?? null,
    };
  });

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Заполнение по поставщику</h1>
      <p className="muted" style={{ margin: 0 }}>
        Сайт находит ваши товары на fortu.ru по названию, берёт оттуда характеристики и сам пишет описание — своими словами, по этим характеристикам. Заполняется
        только пустое: то, что вы уже вписали, не меняется. Тексты и фотографии поставщика не копируются — на них нужно его письменное разрешение.
      </p>
      <div className="stats">
        <div className="stat">
          <div className="muted small">Товаров всего</div>
          <div className="stat__value">{num(total)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Ещё не искали</div>
          <div className="stat__value">{num(todo)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Нашли, ждут проверки</div>
          <div className="stat__value">{num(count("FOUND"))}</div>
        </div>
        <div className="stat">
          <div className="muted small">Заполнено</div>
          <div className="stat__value">{num(count("APPLIED"))}</div>
        </div>
      </div>
      <SearchRunner todo={todo} none={count("NONE")} />
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/catalog/supplier?f=${t.key}`} className={`btn btn--sm ${t.key === tab.key ? "btn--gold" : "btn--line"}`}>
            {t.label} · {count(t.status)}
          </Link>
        ))}
        <form className="row" style={{ gap: 6 }}>
          <input type="hidden" name="f" value={tab.key} />
          <input className="input" name="q" defaultValue={q} placeholder="Найти товар" style={{ minHeight: 40 }} />
        </form>
      </div>
      <SupplierTable key={`${tab.key}:${q}`} rows={rows} tab={tab.key} sure={SURE} />
      {list.length === 150 && <p className="muted small">Показаны первые 150 — заполните их, появятся следующие.</p>}
    </>
  );
}
