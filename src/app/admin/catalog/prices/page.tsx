import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { PriceTable, type Row } from "./PriceTable";

export default async function PricesPage() {
  await requireAdmin();
  const [products, cats] = await Promise.all([
    db.query.product.findMany({
      columns: { id: true, name: true, sku: true, price: true, oldPrice: true, categoryId: true, visibility: true },
      with: {
        variants: { columns: { id: true, name: true, sku: true, price: true, stock: true, isActive: true }, orderBy: asc(s.productVariant.sortOrder) },
        images: { columns: { url: true }, orderBy: asc(s.productImage.sortOrder), limit: 1 },
      },
      orderBy: [asc(s.product.sortOrder), asc(s.product.name)],
    }),
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder)),
  ]);
  const rows: Row[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    oldPrice: p.oldPrice,
    categoryId: p.categoryId,
    hidden: p.visibility !== "PUBLISHED",
    image: p.images[0]?.url ?? null,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, price: v.price, stock: v.stock, active: v.isActive })),
  }));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>Цены и остатки</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 820 }}>
        Меняйте цены и остатки прямо в таблице — изменённые клетки подсвечиваются, сохраняются одной кнопкой. Можно отметить товары и поднять или
        снизить цену на процент. Остатки — уже за вычетом товара в неоплаченных заказах.
      </p>
      <PriceTable rows={rows} categories={cats} />
    </>
  );
}
