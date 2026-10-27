import { asc, count } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { listAttributes } from "@/lib/attributes";
import { requireAdmin } from "@/lib/viewer";
import { AttributeForm } from "./AttributeForm";
import { InstallStandard } from "./InstallStandard";

const TYPE: Record<string, string> = { select: "Варианты", number: "Число", text: "Текст" };

export default async function AttributesAdmin() {
  const me = await requireAdmin();
  const owner = me.role === "OWNER";
  const [attrs, cats, used] = await Promise.all([
    listAttributes(),
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder)),
    db.select({ id: s.productAttribute.attributeId, n: count() }).from(s.productAttribute).groupBy(s.productAttribute.attributeId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Характеристики товаров</h1>
        <Link href="/admin/catalog/attributes/fill" className="btn btn--line btn--sm">
          Заполнить таблицей
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Добавляйте любые характеристики сами: название, что вписывать (варианты, число или текст) и для каких категорий. Значения заполняются в карточке
        товара или таблицей. Покупатель видит их в карточке, в фильтрах каталога и в сравнении. Добавить характеристику можно и прямо из карточки товара —
        кнопкой «+ Своя характеристика».
      </p>

      <details className="panel attr-new" open={attrs.length === 0}>
        <summary className="btn btn--gold btn--sm">+ Добавить характеристику</summary>
        <div style={{ marginTop: 16 }}>
          <AttributeForm attr={null} cats={cats} used={0} />
        </div>
      </details>

      <div className="attr-list">
        <div className="attr-list__head small muted">
          <span>Характеристика</span>
          <span>Тип</span>
          <span>У каких товаров</span>
          <span>Заполнено</span>
        </div>
        {attrs.map((a) => {
          const n = used.find((u) => u.id === a.id)?.n ?? 0;
          const where = a.categoryIds.length ? a.categoryIds.map((id) => catName.get(id) ?? "удалённая категория").join(", ") : "Все товары";
          return (
            <details key={a.id} className="attr-list__item">
              <summary className="attr-list__row">
                <b>
                  {a.name}
                  {a.unit && <span className="muted">, {a.unit}</span>}
                </b>
                <span className="small">{TYPE[a.type] ?? a.type}</span>
                <span className="small muted">{where}</span>
                <span className="small">{n}</span>
              </summary>
              <div className="attr-list__edit">
                <AttributeForm
                  attr={{ id: a.id, name: a.name, key: a.key, unit: a.unit, type: a.type as "number" | "select" | "text", options: a.options, categoryIds: a.categoryIds, filterable: a.filterable, sortOrder: a.sortOrder }}
                  cats={cats}
                  used={n}
                  canDelete={owner}
                />
              </div>
            </details>
          );
        })}
        {!attrs.length && <p className="muted">Пока ни одной — добавьте первую.</p>}
      </div>

      {owner && <InstallStandard />}
    </>
  );
}
