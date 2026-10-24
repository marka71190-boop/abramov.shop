import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { ArticleForm } from "./ArticleForm";

export default async function ArticleEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await requireAdmin();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const a = id === "new" ? null : await db.query.article.findFirst({ where: eq(s.article.id, id) });
  if (id !== "new" && !a) notFound();
  const products = await db
    .select({ id: s.product.id, name: s.product.name, slug: s.product.slug, sku: s.product.sku })
    .from(s.product)
    .orderBy(asc(s.product.name));
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/journal">← Журнал</Link>
      </p>
      <h1>{a ? a.title : "Новая статья"}</h1>
      <ArticleForm key={a?.id ?? "new"} article={a ?? null} products={products} saved={saved === "1"} canDelete={me.role === "OWNER"} />
    </>
  );
}
