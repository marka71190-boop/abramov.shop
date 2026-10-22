"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../../actions";

const In = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Название характеристики").max(60),
  key: z.string().trim().max(40).optional(),
  unit: z.string().trim().max(12).default(""),
  type: z.enum(["number", "select", "text"]),
  options: z.string().max(3000).default(""),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});

export async function saveAttribute(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const key = (d.key?.trim() || slugify(d.name)).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  if (!key) return { error: "Код — латиницей, например weight" };
  const options = d.type === "select" ? [...new Set(d.options.split(/\n|,/).map((x) => x.trim()).filter(Boolean))].slice(0, 100) : [];
  if (d.type === "select" && !options.length) return { error: "Для списка укажите варианты — по одному в строке" };
  const values = {
    name: d.name,
    key,
    unit: d.unit,
    type: d.type,
    options,
    categoryIds: form.getAll("categoryIds").map(String).filter(Boolean).slice(0, 50),
    filterable: form.get("filterable") === "on" && d.type !== "text",
    sortOrder: d.sortOrder,
  };
  try {
    if (d.id) await db.update(s.attribute).set(values).where(eq(s.attribute.id, d.id));
    else await db.insert(s.attribute).values(values);
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message + String((e as { cause?: unknown }).cause))) return { error: "Такой код уже есть — придумайте другой" };
    throw e;
  }
  await audit(me.id, d.id ? "attribute.update" : "attribute.create", "attribute", d.id ?? null, { key });
  revalidatePath("/", "layout");
  return { ok: d.id ? "Сохранено" : "Характеристика добавлена" };
}

export async function deleteAttribute(id: string) {
  const me = await requireAdmin("OWNER");
  await db.delete(s.attribute).where(eq(s.attribute.id, id));
  await audit(me.id, "attribute.delete", "attribute", id);
  revalidatePath("/", "layout");
}
