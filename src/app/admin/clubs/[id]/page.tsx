import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { ClubForm } from "./ClubForm";

export default async function ClubEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin("OWNER");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const c = id === "new" ? null : await db.query.club.findFirst({ where: eq(s.club.id, id) });
  if (id !== "new" && !c) notFound();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/clubs">← Клубы</Link>
      </p>
      <h1>{c ? c.name : "Новый клуб"}</h1>
      <ClubForm club={c ?? null} saved={saved === "1"} />
    </>
  );
}
