import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { manualRelated } from "@/lib/recommend";
import { ProductForm } from "./ProductForm";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function ProductEdit({ params, searchParams }: Props) {
  const me = await requireAdmin();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const categories = await db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder));
  const product =
    id === "new"
      ? null
      : await db.query.product.findFirst({
          where: eq(s.product.id, id),
          with: { variants: { orderBy: asc(s.productVariant.sortOrder) }, images: { orderBy: asc(s.productImage.sortOrder) } },
        });
  if (id !== "new" && !product) notFound();
  const [allProducts, related] = await Promise.all([
    db
      .select({ id: s.product.id, name: s.product.name, sku: s.product.sku, visibility: s.product.visibility })
      .from(s.product)
      .orderBy(asc(s.product.name)),
    product ? manualRelated(product.id) : Promise.resolve([] as string[]),
  ]);
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>{product ? product.name : "Новый товар"}</h1>
      <ProductForm key={product?.id ?? "new"} product={product ?? null} categories={categories} saved={saved === "1"} canDelete={me.role === "OWNER"}
        allProducts={allProducts.filter((p) => p.id !== product?.id)}
        related={related}
      />
    </>
  );
}
