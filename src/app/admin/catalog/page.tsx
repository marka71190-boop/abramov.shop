import { asc, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";
import { VisibilitySelect } from "../VisibilitySelect";

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
    db.select().from(s.product).orderBy(asc(s.product.sortOrder), asc(s.product.name)),
  ]);

  return (
    <>
      <h1>Каталог</h1>
      <p className="muted" style={{ margin: 0 }}>
        Скрытые категории и товары покупатели не видят. Наполните раздел и переключите на «Опубликовано» — он сразу появится на
        главной. Добавление и редактирование товаров с фото и вариантами — на следующем этапе.
      </p>

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
                    {c.name}
                    <div className="muted small">/catalog/{c.slug}</div>
                  </td>
                  <td>{c.count}</td>
                  <td>
                    <VisibilitySelect entity="category" id={c.id} value={c.visibility} />
                  </td>
                  <td>
                    <a href={`/catalog/${c.slug}?preview=${c.previewToken}`} target="_blank" rel="noreferrer">
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
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Цена</th>
                <th>Видимость</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <div className="muted small">{p.sku}</div>
                  </td>
                  <td>{rub(p.price)}</td>
                  <td>
                    <VisibilitySelect entity="product" id={p.id} value={p.visibility} />
                  </td>
                  <td>
                    <a href={`/product/${p.slug}?preview=${p.previewToken}`} target="_blank" rel="noreferrer">
                      Предпросмотр
                    </a>
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
