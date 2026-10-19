import { eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { CUE_GROUPS } from "@/lib/cue-config";
import { CUE_SLUG, getCueConfig } from "@/lib/cue";
import { requireAdmin } from "@/lib/viewer";
import { CueForm } from "./CueForm";

export default async function CueAdmin() {
  await requireAdmin("OWNER");
  const [cfg, stored, product] = await Promise.all([
    getCueConfig(),
    db.query.setting.findFirst({ where: eq(s.setting.key, "cue") }),
    db.query.product.findFirst({ where: eq(s.product.slug, CUE_SLUG), columns: { id: true } }),
  ]);
  return (
    <>
      <h1>Кий «Чемпион» на заказ</h1>
      <p className="muted" style={{ margin: 0 }}>
        Конструктор на странице <Link href="/cue">/cue</Link>: покупатель выбирает параметры, цена = базовая + доплаты за выбранные варианты. Оплата —
        100% онлайн, как у обычного заказа. Параметры сборки попадают в заказ отдельной строкой — для мастерской.
      </p>
      {!stored && (
        <div className="notice" style={{ margin: 0 }}>
          Сейчас здесь <b>примерный прайс</b> — замените породы, варианты и цены на свои, потом включите конструктор.
        </div>
      )}
      {product && (
        <p className="small muted" style={{ margin: 0 }}>
          Вес и габариты посылки для СДЭК — в служебном товаре <Link href={`/admin/catalog/product/${product.id}`}>«Кий «Чемпион» на заказ»</Link> (он скрыт из
          каталога). Там же можно задать категорию — чтобы на кий действовали промокоды этой категории.
        </p>
      )}
      <CueForm initial={cfg} meta={CUE_GROUPS} />
    </>
  );
}
