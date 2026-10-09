import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { PageForm } from "./PageForm";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditPage({ params, searchParams }: Props) {
  const me = await requireAdmin();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const page = id === "new" ? null : await db.query.page.findFirst({ where: eq(s.page.id, id) });
  if (id !== "new" && !page) notFound();

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/pages">← Страницы</Link>
      </p>
      <h1>{page ? page.title : "Новая страница"}</h1>
      {page && ["consent", "marketing-consent"].includes(page.slug) && (
        <div className="form-ok">
          Текст этой страницы берётся из текущей редакции согласия в журнале согласий, чтобы на сайте и в журнале был один и тот же
          документ. Здесь меняются только заголовок и видимость.
        </div>
      )}
      <PageForm page={page ?? null} saved={saved === "1"} canDelete={me.role === "OWNER"} />
    </>
  );
}
