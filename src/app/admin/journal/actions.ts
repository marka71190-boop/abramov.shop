"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { SECTIONS } from "@/lib/journal-shared";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/viewer";

const In = z.object({
  id: z.string().max(64).optional(),
  title: z.string().trim().min(3, "Заголовок").max(200),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  section: z.string().refine((v) => v in SECTIONS, "Раздел"),
  excerpt: z.string().trim().max(400).default(""),
  body: z.string().max(100_000).default(""),
  cover: z.string().trim().max(500).optional(),
  productIds: z.string().max(5000).optional(),
  visibility: z.enum(["DRAFT", "HIDDEN", "PUBLISHED"]),
  publishAt: z.string().optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(300).optional(),
});

const mskDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(+d) ? null : d;
};

export async function saveArticle(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const slug = (d.slug || slugify(d.title)).replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  if (!slug) return { error: "Адрес статьи — латиница, цифры и дефис" };
  const ids = z.array(z.string().max(64)).max(12).safeParse(JSON.parse(d.productIds || "[]"));
  const cover = d.cover && /^(\/|https:\/\/)[^\s"<>]+$/.test(d.cover) ? d.cover : null;
  const values = {
    title: d.title,
    slug,
    section: d.section,
    excerpt: d.excerpt,
    body: d.body.replace(/\r\n/g, "\n"),
    cover,
    productIds: ids.success ? ids.data : [],
    visibility: d.visibility,
    publishAt: mskDate(d.publishAt),
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
    updatedAt: new Date(),
  };
  let id = d.id;
  try {
    if (id) await db.update(s.article).set(values).where(eq(s.article.id, id));
    else id = (await db.insert(s.article).values(values).returning({ id: s.article.id }))[0].id;
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message + String((e as { cause?: unknown }).cause))) return { error: "Статья с таким адресом уже есть — поменяйте адрес" };
    throw e;
  }
  await audit(me.id, d.id ? "article.update" : "article.create", "article", id, { slug });
  revalidatePath("/zhurnal");
  revalidatePath(`/zhurnal/${slug}`);
  if (!d.id) redirect(`/admin/journal/${id}?saved=1`);
  return { ok: "Сохранено" };
}

export async function deleteArticle(id: string) {
  const me = await requireAdmin("OWNER");
  await db.delete(s.article).where(eq(s.article.id, id));
  await audit(me.id, "article.delete", "article", id);
  revalidatePath("/zhurnal");
  redirect("/admin/journal");
}
