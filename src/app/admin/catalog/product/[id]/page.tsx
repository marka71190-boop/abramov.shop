import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { manualRelated } from "@/lib/recommend";
import { attrValues, listAttributes } from "@/lib/attributes";
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
  const [defs, vals] = await Promise.all([listAttributes(), product ? attrValues([product.id]) : Promise.resolve(new Map<string, Map<string, string>>())]);
  const mine = Object.fromEntries([...(vals.get(product?.id ?? "") ?? new Map<string, string>())].map(([k, v]) => [k, defs.find((d) => d.id === k)?.type === "number" ? v.replace(".", ",") : v]));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>{product ? product.name : "Новый товар"}</h1>
      <ProductForm key={product?.id ?? "new"} product={product ?? null} categories={categories} saved={saved === "1"} canDelete={me.role === "OWNER"}
        allProducts={allProducts.filter((p) => p.id !== product?.id)}
        related={related}
        attrDefs={defs.map((d) => ({ id: d.id, name: d.name, unit: d.unit, type: d.type, options: d.options, categoryIds: d.categoryIds }))}
        attrValues={mine}
      />
    </>
  );
}
