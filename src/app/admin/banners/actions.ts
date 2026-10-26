"use server";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { safeUrl, SLIDE_TONES, STRIP_TONES } from "@/lib/banners-shared";
import { requireAdmin } from "@/lib/viewer";

const img = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (/^(\/(?!\/)|https:\/\/)[^\s"<>\\]+$/.test(v) ? v : null));

const In = z.object({
  id: z.string().max(64).optional(),
  place: z.enum(["HOME", "STRIP"]),
  label: z.string().trim().max(40).default(""),
  title: z.string().trim().max(140).default(""),
  text: z.string().trim().max(300).default(""),
  image: img.optional(),
  imageMobile: img.optional(),
  buttonText: z.string().trim().max(40).default(""),
  url: z.string().trim().max(500).default(""),
  tone: z.string().max(20).default("dark"),
  countdown: z.string().optional(),
  isActive: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

const mskDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(+d) ? null : d;
};

const refresh = () => revalidatePath("/", "layout");

export async function saveBanner(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const d = p.data;
  const url = safeUrl(d.url);
  if (d.url && !url) return { error: "Ссылка — адрес на сайте, начиная с «/» (например /catalog), или https://…" };
  const startsAt = mskDate(d.startsAt);
  const endsAt = mskDate(d.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "Окончание показа должно быть позже начала" };
  const strip = d.place === "STRIP";
  if (strip && !d.title && !d.text) return { error: "Напишите текст объявления" };
  if (!strip && !d.image && !d.title) return { error: "Загрузите картинку или напишите заголовок" };
  const tones: Record<string, string> = strip ? STRIP_TONES : SLIDE_TONES;
  const tone = d.tone in tones ? d.tone : strip ? "gold" : "dark";
  const countdown = d.countdown === "on";
  if (countdown && !endsAt) return { error: "Для отсчёта «до конца акции» укажите окончание показа" };

  const values = {
    place: d.place,
    label: d.label,
    title: d.title,
    text: d.text.replace(/\r\n/g, "\n"),
    image: strip ? null : (d.image ?? null),
    imageMobile: strip ? null : (d.imageMobile ?? null),
    buttonText: d.buttonText,
    url,
    tone,
    countdown,
    isActive: d.isActive === "on",
    startsAt,
    endsAt,
    updatedAt: new Date(),
  };
  let id = d.id;
  if (id) {
    const cur = await db.query.banner.findFirst({ where: eq(s.banner.id, id), columns: { place: true } });
    if (!cur) return { error: "Баннер не найден" };
    const sortPatch = cur.place !== d.place ? { sortOrder: await nextOrder(d.place) } : {};
    await db.update(s.banner).set({ ...values, ...sortPatch }).where(eq(s.banner.id, id));
  } else {
    id = (await db.insert(s.banner).values({ ...values, sortOrder: await nextOrder(d.place) }).returning({ id: s.banner.id }))[0].id;
  }
  await audit(me.id, d.id ? "banner.update" : "banner.create", "banner", id, { place: d.place, title: d.title || d.text.slice(0, 60) });
  refresh();
  if (!d.id) redirect(`/admin/banners/${id}?saved=1`);
  return { ok: "Сохранено" };
}

async function nextOrder(place: "HOME" | "STRIP") {
  const rows = await db.select({ o: s.banner.sortOrder }).from(s.banner).where(eq(s.banner.place, place));
  return rows.reduce((m, r) => Math.max(m, r.o), -1) + 1;
}

export async function toggleBanner(id: string) {
  const me = await requireAdmin();
  const b = await db.query.banner.findFirst({ where: eq(s.banner.id, id) });
  if (!b) return;
  await db.update(s.banner).set({ isActive: !b.isActive }).where(eq(s.banner.id, id));
  await audit(me.id, b.isActive ? "banner.off" : "banner.on", "banner", id);
  refresh();
  revalidatePath("/admin/banners");
}

/** Поднять или опустить баннер в очереди показа */
export async function moveBanner(id: string, dir: -1 | 1) {
  await requireAdmin();
  const b = await db.query.banner.findFirst({ where: eq(s.banner.id, id) });
  if (!b) return;
  const list = await db.query.banner.findMany({ where: eq(s.banner.place, b.place), orderBy: [asc(s.banner.sortOrder), asc(s.banner.createdAt)] });
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (const [k, x] of list.entries()) if (x.sortOrder !== k) await tx.update(s.banner).set({ sortOrder: k }).where(eq(s.banner.id, x.id));
  });
  refresh();
  revalidatePath("/admin/banners");
}

export async function copyBanner(id: string) {
  const me = await requireAdmin();
  const b = await db.query.banner.findFirst({ where: eq(s.banner.id, id) });
  if (!b) return;
  const { id: _i, createdAt: _c, updatedAt: _u, clicks: _k, ...rest } = b;
  const [row] = await db
    .insert(s.banner)
    .values({ ...rest, isActive: false, title: rest.title ? `${rest.title} (копия)` : rest.title, sortOrder: await nextOrder(b.place) })
    .returning({ id: s.banner.id });
  await audit(me.id, "banner.create", "banner", row.id, { copyOf: id });
  redirect(`/admin/banners/${row.id}`);
}

export async function deleteBanner(id: string) {
  const me = await requireAdmin();
  await db.delete(s.banner).where(eq(s.banner.id, id));
  await audit(me.id, "banner.delete", "banner", id);
  refresh();
  redirect("/admin/banners");
}
