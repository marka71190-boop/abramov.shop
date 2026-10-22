import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { bundleCards, listBundles } from "@/lib/bundles";
import { requireAdmin } from "@/lib/viewer";
import { BundleForm } from "./BundleForm";

export default async function BundlesAdmin() {
  await requireAdmin();
  const [bundles, products] = await Promise.all([
    listBundles(),
    db
      .select({ id: s.product.id, name: s.product.name, sku: s.product.sku, price: s.product.price, visibility: s.product.visibility })
      .from(s.product)
      .orderBy(asc(s.product.name)),
  ]);
  // Какие комплекты сейчас видны покупателям (все товары опубликованы и в наличии)
  const live = new Set((await bundleCards(bundles.filter((b) => b.isActive))).map((b) => b.id));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Комплекты со скидкой</h1>
      <p className="muted" style={{ margin: 0 }}>
        Комплект показывается в карточке каждого своего товара: «Вместе дешевле», одна кнопка кладёт всё в корзину. Скидка считается сама, когда в
        корзине есть все товары комплекта (любой вариант). Промокод после этого считается от цены со скидкой комплекта.
      </p>
      {bundles.map((b) => (
        <BundleForm
          key={b.id}
          bundle={{ id: b.id, name: b.name, note: b.note, percent: b.percent, productIds: b.productIds, isActive: b.isActive, sortOrder: b.sortOrder }}
          products={products}
          live={live.has(b.id)}
        />
      ))}
      <BundleForm bundle={null} products={products} live={false} />
    </>
  );
}
