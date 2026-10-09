import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
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
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>{product ? product.name : "Новый товар"}</h1>
      <ProductForm key={product?.id ?? "new"} product={product ?? null} categories={categories} saved={saved === "1"} canDelete={me.role === "OWNER"} />
    </>
  );
}
