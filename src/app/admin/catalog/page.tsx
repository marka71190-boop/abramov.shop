import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";
import { VisibilitySelect } from "../VisibilitySelect";
import { duplicateProduct, fillMissingSkus } from "./cue-actions";

export default async function CatalogAdmin() {
  const [cats, products] = await Promise.all([
    db
      .select({
        id: s.category.id,
        name: s.category.name,
        slug: s.category.slug,
        visibility: s.category.visibility,
        previewToken: s.category.previewToken,
        count: sql<number>`(select count(*)::int from ${s.product} where ${s.product.categoryId} = ${s.category.id})`,
      })
      .from(s.category)
      .orderBy(asc(s.category.sortOrder)),
    db
      .select({
        id: s.product.id,
        name: s.product.name,
        slug: s.product.slug,
        sku: s.product.sku,
        price: s.product.price,
        channel: s.product.channel,
        visibility: s.product.visibility,
        previewToken: s.product.previewToken,
        category: sql<
          string | null
        >`(select ${s.category.name} from ${s.category} where ${s.category.id} = ${s.product.categoryId})`,
        image: sql<string | null>`(select i.url from product_image i where i.product_id = "product"."id" order by i.sort_order limit 1)`,
        stock: sql<number>`(select coalesce(sum(${s.productVariant.stock}), 0)::int from ${s.productVariant} where ${s.productVariant.productId} = ${s.product.id} and ${s.productVariant.isActive})`,
      })
      .from(s.product)
      .orderBy(asc(s.product.sortOrder), asc(s.product.name)),
  ]);

  return (
    <>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <h1 style={{ margin: 0 }}>Каталог</h1>
        <div className="row">
          <Link
            className="btn btn--line btn--sm"
            href="/admin/catalog/attributes"
          >
            Характеристики
          </Link>
          <Link className="btn btn--gold btn--sm" href="/admin/catalog/prices">
            Цены и остатки
          </Link>
          <Link className="btn btn--line btn--sm" href="/admin/catalog/bundles">
            Комплекты
          </Link>
          <Link className="btn btn--line btn--sm" href="/admin/catalog/import">
            Загрузить из Excel
          </Link>
          <a className="btn btn--line btn--sm" href="/admin/catalog/export">
            Выгрузить в Excel
          </a>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Скрытые категории и товары покупатели не видят. Наполните раздел и
        переключите на «Опубликовано» — он сразу появится на главной.
      </p>
      <div className="row">
        <Link href="/admin/catalog/new-cue" className="btn btn--gold btn--sm">
          + Кий быстро
        </Link>
        <Link
          href="/admin/catalog/product/new"
          className="btn btn--line btn--sm"
        >
          + Товар
        </Link>
        <Link
          href="/admin/catalog/category/new"
          className="btn btn--line btn--sm"
        >
          + Категория
        </Link>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Категории</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Категория</th>
                <th>Товаров</th>
                <th>Видимость</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/catalog/category/${c.id}`}>
                      {c.name}
                    </Link>
                    <div className="muted small">/catalog/{c.slug}</div>
                  </td>
                  <td>{c.count}</td>
                  <td>
                    <VisibilitySelect
                      entity="category"
                      id={c.id}
                      value={c.visibility}
                    />
                  </td>
                  <td>
                    <a
                      href={`/catalog/${c.slug}?preview=${c.previewToken}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Предпросмотр
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Товары</h2>
        {products.some((p) => !p.sku) && (
          <form action={fillMissingSkus} className="row small" style={{ gap: 10, alignItems: "center" }}>
            <span className="muted">Без артикула: {products.filter((p) => !p.sku).length}</span>
            <button className="btn btn--line btn--sm">Проставить артикулы автоматически</button>
          </form>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Цена</th>
                <th>Остаток</th>
                <th>Видимость</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div
                      className="row"
                      style={{
                        gap: 10,
                        flexWrap: "nowrap",
                        alignItems: "center",
                      }}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="admin-thumb"
                          loading="lazy"
                        />
                      ) : (
                        <span className="admin-thumb" />
                      )}
                      <div>
                        <Link href={`/admin/catalog/product/${p.id}`}>
                          {p.name}
                        </Link>
                        {p.channel !== "RETAIL" && (
                          <span
                            className="pill pill--warn"
                            style={{ marginLeft: 6 }}
                          >
                            {p.channel === "WHOLESALE" ? "только опт" : "+ опт"}
                          </span>
                        )}
                        <div className="muted small">
                          {[p.category ?? "без категории", p.sku]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{rub(p.price)}</td>
                  <td
                    style={{
                      color: p.stock === 0 ? "var(--c-danger)" : undefined,
                    }}
                  >
                    {p.stock}
                  </td>
                  <td>
                    <VisibilitySelect
                      entity="product"
                      id={p.id}
                      value={p.visibility}
                    />
                  </td>
                  <td>
                    <div
                      className="row small"
                      style={{ gap: 12, flexWrap: "nowrap" }}
                    >
                      <a
                        href={`/product/${p.slug}?preview=${p.previewToken}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Предпросмотр
                      </a>
                      <form action={duplicateProduct.bind(null, p.id)}>
                        <button
                          className="linklike small"
                          title="Копия со всеми характеристиками — черновиком"
                        >
                          Похожий
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
