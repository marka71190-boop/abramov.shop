import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { appliesTo, listAttributes } from "@/lib/attributes";
import { requireAdmin } from "@/lib/viewer";
import { GridForm } from "./GridForm";

export default async function FillAttributes({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const me = await requireAdmin();
  const { cat } = await searchParams;
  const [cats, attrs, counts] = await Promise.all([
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder), asc(s.category.name)),
    listAttributes(),
    db.select({ c: s.product.categoryId, id: s.product.id }).from(s.product),
  ]);
  const perCat = new Map<string, number>();
  for (const r of counts) if (r.c) perCat.set(r.c, (perCat.get(r.c) ?? 0) + 1);
  const current = cats.find((c) => c.id === cat) ?? cats.find((c) => perCat.get(c.id)) ?? cats[0];

  const products = current
    ? await db
        .select({ id: s.product.id, name: s.product.name, sku: s.product.sku, visibility: s.product.visibility })
        .from(s.product)
        .where(eq(s.product.categoryId, current.id))
        .orderBy(asc(s.product.sortOrder), asc(s.product.name))
        .limit(300)
    : [];
  const mine = current ? attrs.filter((a) => appliesTo(a, current.id)) : [];
  const vals = products.length
    ? await db
        .select()
        .from(s.productAttribute)
        .where(and(inArray(s.productAttribute.productId, products.map((p) => p.id)), inArray(s.productAttribute.attributeId, mine.length ? mine.map((a) => a.id) : ["-"])))
    : [];
  const values: Record<string, string> = {};
  for (const v of vals) values[`${v.productId}:${v.attributeId}`] = v.value;

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog/attributes">← Характеристики</Link>
      </p>
      <h1>Заполнить характеристики</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Все товары категории в одной таблице: заполните значения и сохраните разом. Они появятся в карточке товара, в фильтрах каталога и в сравнении.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {cats.map((c) => (
          <Link key={c.id} href={`/admin/catalog/attributes/fill?cat=${c.id}`} className={`btn btn--sm ${c.id === current?.id ? "btn--gold" : "btn--line"}`}>
            {c.name} <span className="muted">· {perCat.get(c.id) ?? 0}</span>
          </Link>
        ))}
      </div>
      {!current ? (
        <p className="muted">Категорий пока нет.</p>
      ) : !products.length ? (
        <p className="muted">В категории «{current.name}» пока нет товаров.</p>
      ) : !mine.length ? (
        <p className="muted">
          Для категории «{current.name}» нет характеристик.{" "}
          {me.role === "OWNER" && <Link href="/admin/catalog/attributes">Добавить</Link>}
        </p>
      ) : (
        <GridForm
          key={current.id}
          categoryId={current.id}
          products={products}
          attrs={mine.map((a) => ({ id: a.id, name: a.name, unit: a.unit, type: a.type as "number" | "select" | "text", options: a.options }))}
          values={values}
        />
      )}
    </>
  );
}
