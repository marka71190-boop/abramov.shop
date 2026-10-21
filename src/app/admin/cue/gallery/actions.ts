"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { cueKey, parseCueKey } from "@/lib/cue-config";
import { showcaseFromOrder } from "@/lib/showcase";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../../actions";

const strip = (key: string | null | undefined) => {
  const sel = key ? parseCueKey(key) : null;
  return sel ? cueKey({ ...sel, e: undefined }) : null;
};

/** Из конструктора: текущая сборка → новая работа в галерее (гравировку не берём) */
export async function showcaseFromBuilder(key: string) {
  const me = await requireAdmin();
  const k = strip(key);
  if (!k) return;
  const [row] = await db.insert(s.cueShowcase).values({ title: "Чемпион", cueKey: k, published: false }).returning({ id: s.cueShowcase.id });
  await audit(me.id, "showcase.create", "showcase", row.id);
  redirect(`/admin/cue/gallery/${row.id}`);
}

/** Из заказа: после «Кий готов» */
export async function showcaseFromOrderAction(orderId: string) {
  const me = await requireAdmin();
  const id = await showcaseFromOrder(orderId);
  if (!id) return;
  await audit(me.id, "showcase.from_order", "showcase", id, { orderId });
  redirect(`/admin/cue/gallery/${id}`);
}

const In = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(2, "Напишите название").max(120),
  description: z.string().trim().max(1500).default(""),
  photos: z.string().max(10_000),
  cueKey: z.string().max(400).optional(),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});

export async function saveShowcase(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const photos = z.array(z.string().regex(/^(\/media\/|\/images\/|https:\/\/)[^\s"<>]+$/)).max(12, "До 12 фото").safeParse(JSON.parse(d.photos || "[]"));
  if (!photos.success) return { error: photos.error.issues[0]?.message ?? "Ошибка в списке фото" };
  const published = form.get("published") === "on";
  if (published && !photos.data.length) return { error: "Чтобы показать на сайте, добавьте хотя бы одно фото" };
  await db
    .update(s.cueShowcase)
    .set({ title: d.title, description: d.description, photos: photos.data, cueKey: strip(d.cueKey) ?? null, sortOrder: d.sortOrder, published })
    .where(eq(s.cueShowcase.id, d.id));
  await audit(me.id, "showcase.update", "showcase", d.id, { published });
  revalidatePath("/cue");
  revalidatePath("/admin/cue/gallery");
  return { ok: published ? "Сохранено — работа видна на странице конструктора" : "Сохранено (скрыто с сайта)" };
}

export async function deleteShowcase(id: string) {
  const me = await requireAdmin();
  await db.delete(s.cueShowcase).where(eq(s.cueShowcase.id, id));
  await audit(me.id, "showcase.delete", "showcase", id);
  revalidatePath("/cue");
  redirect("/admin/cue/gallery");
}
