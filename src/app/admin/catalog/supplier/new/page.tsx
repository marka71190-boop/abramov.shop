import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { NewFromSupplier } from "./NewFromSupplier";

export const metadata: Metadata = { title: "Новый товар с сайта поставщика" };
export const dynamic = "force-dynamic";

/** Новый товар в два шага: нашли у поставщика → сайт сам создал черновик с фото, характеристиками и описанием */
export default async function NewFromSupplierPage() {
  await requireAdmin();
  const categories = await db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder), asc(s.category.name));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Новый товар с Фортуны</h1>
      <p className="muted" style={{ margin: 0 }}>
        Найдите товар на fortu.ru — сайт сам создаст черновик: название, фото, характеристики, описание и рекомендованную цену. Вам останется проверить, вписать
        остаток и опубликовать. Несколько похожих карточек (жёсткость, диаметр, цвет) можно собрать в один товар с вариантами — у каждого варианта будет своё
        описание, цена и фото.
      </p>
      <NewFromSupplier categories={categories} />
    </>
  );
}
