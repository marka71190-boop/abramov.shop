import { asc, count } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { listAttributes } from "@/lib/attributes";
import { requireAdmin } from "@/lib/viewer";
import { AttributeForm } from "./AttributeForm";
import { InstallStandard } from "./InstallStandard";

export default async function AttributesAdmin() {
  await requireAdmin("OWNER");
  const [attrs, cats, used] = await Promise.all([
    listAttributes(),
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder)),
    db.select({ id: s.productAttribute.attributeId, n: count() }).from(s.productAttribute).groupBy(s.productAttribute.attributeId),
  ]);
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Характеристики товаров</h1>
        <Link href="/admin/catalog/attributes/fill" className="btn btn--gold btn--sm">
          Заполнить таблицей
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Значения заполняются в карточке товара. Покупатель видит их в карточке, в фильтрах каталога («Числа» — фильтр «от–до», «Список» — галочки) и в
        сравнении. Если выбрать категории — характеристика будет только у их товаров.
      </p>
      <InstallStandard />
      {attrs.map((a) => (
        <AttributeForm
          key={a.id}
          attr={{ id: a.id, name: a.name, key: a.key, unit: a.unit, type: a.type as "number" | "select" | "text", options: a.options, categoryIds: a.categoryIds, filterable: a.filterable, sortOrder: a.sortOrder }}
          cats={cats}
          used={used.find((u) => u.id === a.id)?.n ?? 0}
        />
      ))}
      <AttributeForm attr={null} cats={cats} used={0} />
    </>
  );
}
