import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { BannerForm } from "./BannerForm";

export default async function BannerEdit({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; place?: string }>;
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b = id === "new" ? null : await db.query.banner.findFirst({ where: eq(s.banner.id, id) });
  if (id !== "new" && !b) notFound();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/banners">← Баннеры</Link>
      </p>
      <h1>{b ? b.title || b.text.slice(0, 60) || "Баннер" : "Новый баннер"}</h1>
      <BannerForm key={b?.id ?? "new"} banner={b ?? null} place={sp.place === "STRIP" ? "STRIP" : "HOME"} saved={sp.saved === "1"} />
    </>
  );
}
