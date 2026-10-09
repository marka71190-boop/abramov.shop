import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { CategoryForm } from "./CategoryForm";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function CategoryEdit({ params, searchParams }: Props) {
  const me = await requireAdmin();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const category = id === "new" ? null : await db.query.category.findFirst({ where: eq(s.category.id, id) });
  if (id !== "new" && !category) notFound();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/catalog">← Каталог</Link>
      </p>
      <h1>{category ? category.name : "Новая категория"}</h1>
      <CategoryForm key={category?.id ?? "new"} category={category ?? null} saved={saved === "1"} canDelete={me.role === "OWNER"} />
    </>
  );
}
