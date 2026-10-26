import type { Metadata } from "next";
import Link from "next/link";
import { CompareRedirect, CompareRemove } from "@/components/product/Compare";
import { Stars } from "@/components/product/Stars";
import { attrValues, formatAttr, listAttributes } from "@/lib/attributes";
import { getPublicProductsByIds } from "@/lib/catalog";
import { rub } from "@/lib/format";
import { ratingsFor } from "@/lib/reviews";
import { getViewer, isAdmin } from "@/lib/viewer";

export const metadata: Metadata = { title: "Сравнение товаров", robots: { index: false } };

type Props = { searchParams: Promise<{ ids?: string }> };

export default async function ComparePage({ searchParams }: Props) {
  const { ids: raw } = await searchParams;
  const ids = [...new Set((raw ?? "").split(",").map((x) => x.trim()).filter((x) => /^[\w-]{1,64}$/.test(x)))].slice(0, 4);
  if (!ids.length) {
    return (
      <section className="container page-pad stack">
        <CompareRedirect />
        <h1 className="h2">Сравнение</h1>
        <p className="muted">
          Пока нечего сравнивать. В карточке товара нажмите «Сравнить» — можно до 4 товаров. <Link href="/catalog">В каталог</Link>
        </p>
      </section>
    );
  }
  const found = await getPublicProductsByIds(ids);
  const products = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const [defs, vals, ratings, viewer] = await Promise.all([listAttributes(), attrValues(products.map((p) => p.id)), ratingsFor(products.map((p) => p.id)), getViewer()]);
  const admin = isAdmin(viewer);
  // Товары без единой характеристики — для подсказки администратору
  const empty = products.filter((p) => !vals.get(p.id)?.size);
  const rows = defs
    .map((a) => ({ a, cells: products.map((p) => vals.get(p.id)?.get(a.id) ?? null) }))
    .filter((r) => r.cells.some((c) => c != null));
  const diff = (cells: (string | null)[]) => new Set(cells.map((c) => c ?? "—")).size > 1;

  return (
    <section className="container page-pad stack" style={{ gap: 20 }}>
      <h1 className="h2" style={{ margin: 0 }}>
        Сравнение
      </h1>
      {products.length < 2 && <p className="muted" style={{ margin: 0 }}>Добавьте ещё товар — кнопка «Сравнить» в карточке.</p>}
      {products.length > 1 && rows.length > 0 && (
        <label className="check small compare-only">
          <input type="checkbox" id="compare-diff" />
          <span>Только различия</span>
        </label>
      )}
      <div className="table-wrap compare-wrap">
        <table className="table compare-table">
          <thead>
            <tr>
              <th />
              {products.map((p) => (
                <th key={p.id}>
                  <Link href={`/product/${p.slug}`}>{p.image ? <img src={p.image.url} alt={p.image.alt} /> : null}</Link>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/product/${p.slug}`}>{p.name}</Link>
                  </div>
                  <CompareRemove productId={p.id} ids={products.map((x) => x.id)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={diff(products.map((p) => String(p.price))) ? "is-diff" : undefined}>
              <td className="muted">Цена</td>
              {products.map((p) => (
                <td key={p.id}>
                  <b>
                    {p.variants.length > 1 && new Set(p.variants.map((v) => v.price)).size > 1 ? "от " : ""}
                    {rub(p.price)}
                  </b>
                </td>
              ))}
            </tr>
            <tr className={diff(products.map((p) => String(p.stock > 0))) ? "is-diff" : undefined}>
              <td className="muted">Наличие</td>
              {products.map((p) => (
                <td key={p.id}>{p.stock > 0 ? "В наличии" : <span className="muted">Нет в наличии</span>}</td>
              ))}
            </tr>
            <tr className={diff(products.map((p) => String(ratings.get(p.id)?.avg ?? ""))) ? "is-diff" : undefined}>
              <td className="muted">Оценка</td>
              {products.map((p) => {
                const r = ratings.get(p.id);
                return <td key={p.id}>{r ? <span className="row small" style={{ gap: 6 }}><Stars value={r.avg} size={14} /> {r.avg.toFixed(1)} · {r.count}</span> : <span className="muted">—</span>}</td>;
              })}
            </tr>
            {rows.map(({ a, cells }) => (
              <tr key={a.id} className={diff(cells) ? "is-diff" : undefined}>
                <td className="muted">{a.name}</td>
                {cells.map((c, i) => (
                  <td key={products[i].id}>{c != null ? formatAttr(a, c) : <span className="muted">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted small" style={{ margin: 0 }}>У этих товаров пока не заполнены характеристики.</p>}
      {admin && empty.length > 0 && (
        <div className="notice notice--muted small" style={{ textAlign: "left" }}>
          Для администратора: без характеристик — {empty.map((p) => p.name).join(", ")}.{" "}
          <Link href={`/admin/catalog/attributes/fill${empty[0].categoryId ? `?cat=${empty[0].categoryId}` : ""}`}>Заполнить таблицей</Link>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>Подсвечены строки, где товары отличаются.</p>
    </section>
  );
}
