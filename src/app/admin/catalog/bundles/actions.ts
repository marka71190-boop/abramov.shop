"use server";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { BUNDLE_MAX, BUNDLE_MIN } from "@/lib/bundles";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../../actions";

const In = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(3, "Название комплекта").max(120),
  note: z.string().trim().max(300).default(""),
  percent: z.coerce.number().int("Скидка — целым числом").min(1, "Скидка от 1%").max(50, "Скидка до 50%"),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  productIds: z.string().max(2000),
});

export async function saveBundle(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const ids = z.array(z.string().max(64)).safeParse(JSON.parse(d.productIds || "[]"));
  if (!ids.success) return { error: "Ошибка в списке товаров" };
  const uniq = [...new Set(ids.data)];
  if (uniq.length < BUNDLE_MIN || uniq.length > BUNDLE_MAX) return { error: `В комплекте от ${BUNDLE_MIN} до ${BUNDLE_MAX} разных товаров` };
  const exist = await db.select({ id: s.product.id }).from(s.product).where(inArray(s.product.id, uniq));
  if (exist.length !== uniq.length) return { error: "Какого-то товара уже нет — обновите страницу" };
  const values = { name: d.name, note: d.note, percent: d.percent, sortOrder: d.sortOrder, productIds: uniq, isActive: form.get("isActive") === "on" };
  let id = d.id;
  if (id) await db.update(s.bundle).set(values).where(eq(s.bundle.id, id));
  else id = (await db.insert(s.bundle).values(values).returning({ id: s.bundle.id }))[0].id;
  await audit(me.id, d.id ? "bundle.update" : "bundle.create", "bundle", id, { percent: d.percent, products: uniq.length });
  revalidatePath("/", "layout");
  return { ok: d.id ? "Сохранено" : "Комплект создан" };
}

export async function deleteBundle(id: string) {
  const me = await requireAdmin();
  await db.delete(s.bundle).where(eq(s.bundle.id, id));
  await audit(me.id, "bundle.delete", "bundle", id);
  revalidatePath("/", "layout");
}
