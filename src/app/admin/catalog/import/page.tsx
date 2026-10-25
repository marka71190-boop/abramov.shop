import Link from "next/link";
import { requireAdmin } from "@/lib/viewer";
import { ImportForm } from "./ImportForm";

export default async function CatalogImport() {
  await requireAdmin();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Загрузка из Excel</h1>
      <p className="muted" style={{ margin: 0 }}>
        Сразу много товаров: новые создаются, существующие обновляются по артикулу. Перед загрузкой сайт покажет, что изменится.
      </p>
      <p className="muted small" style={{ margin: 0 }}>
        В файле есть колонки характеристик («Характеристика: Вес, г» и другие), видео, «Где продаётся», оптовая цена и минимальная партия. Быстрее всего
        — выгрузить каталог, заполнить эти колонки и загрузить обратно. Пустая ячейка — не меняется, «-» — очистить.
      </p>
      <ImportForm />
    </>
  );
}
