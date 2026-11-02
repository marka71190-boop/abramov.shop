import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { listAttributes } from "@/lib/attributes";
import { isGroup } from "@/lib/attributes-pro";
import { requireAdmin } from "@/lib/viewer";
import { QuickCueForm } from "./QuickCueForm";

/** Поля быстрой формы — в этом порядке; характеристики, которых нет в справочнике, не показываем */
const KEYS = ["brand", "weight", "length", "tip", "construction", "butt", "shaft", "joint", "balance", "level", "handmade", "with_case"];

export default async function NewCuePage() {
  await requireAdmin();
  const [cats, defs] = await Promise.all([
    db.select({ id: s.category.id, name: s.category.name, slug: s.category.slug }).from(s.category).orderBy(asc(s.category.sortOrder)),
    listAttributes(),
  ]);
  const cueCats = cats.filter((c) => isGroup("cues", c));
  const fields = KEYS.map((k) => defs.find((d) => d.key === k))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ key: d.key, name: d.name, unit: d.unit, type: d.type as "number" | "select" | "text", options: d.options }));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Быстро добавить кий</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
        Только главное: фото, мастер, вес, длина, материал и цена. Размеры коробки для СДЭК подставятся по конструкции, остальное можно дописать
        потом в полной карточке товара. Удобно с телефона: выберите сразу все фото из галереи.
      </p>
      {!cueCats.length && (
        <div className="notice notice--muted" style={{ textAlign: "left" }}>
          Не нашли категорию киёв (по названию «Кии»). Выберите категорию ниже вручную.
        </div>
      )}
      <QuickCueForm categories={cats.map((c) => ({ id: c.id, name: c.name }))} defaultCategory={cueCats[0]?.id ?? ""} fields={fields} />
    </>
  );
}
