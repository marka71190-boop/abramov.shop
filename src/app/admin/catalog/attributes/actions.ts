"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { appliesTo, listAttributes, normalizeAttr } from "@/lib/attributes";
import { installProAttributes } from "@/lib/attributes-pro";
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

/** Добавить стандартные характеристики бильярдных товаров к подходящим категориям */
export async function installStandard(_: ActionState): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const r = await installProAttributes(db);
  await audit(me.id, "attribute.install", "attribute", null, { created: r.created, updated: r.updated });
  revalidatePath("/", "layout");
  const parts = [`Добавлено: ${r.created}`, `обновлено: ${r.updated}`];
  if (r.skipped.length) parts.push(`не добавлены, пока нет категории: ${r.skipped.join(", ")}`);
  return { ok: parts.join("; ") };
}

/** Заполнение таблицей: значения характеристик сразу у многих товаров категории */
export async function saveGrid(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const categoryId = String(form.get("categoryId") ?? "");
  const cat = await db.query.category.findFirst({ where: eq(s.category.id, categoryId), columns: { id: true } });
  if (!cat) return { error: "Категория не найдена" };
  const [attrs, products] = await Promise.all([
    listAttributes(),
    db.select({ id: s.product.id, name: s.product.name }).from(s.product).where(eq(s.product.categoryId, categoryId)),
  ]);
  const mine = attrs.filter((a) => appliesTo(a, categoryId));
  const pids = new Set(products.map((p) => p.id));
  const errors: string[] = [];
  const rows: { productId: string; attributeId: string; value: string }[] = [];
  const touched = new Set<string>();
  for (const [k, raw] of form.entries()) {
    const m = /^v:([\w-]{1,64}):([\w-]{1,64})$/.exec(k);
    if (!m || !pids.has(m[1])) continue;
    const a = mine.find((x) => x.id === m[2]);
    if (!a) continue;
    touched.add(m[1]);
    const r = normalizeAttr(a, raw);
    if ("error" in r) {
      errors.push(`${products.find((p) => p.id === m[1])?.name}: ${r.error}`);
      continue;
    }
    if (r.value != null) rows.push({ productId: m[1], attributeId: a.id, value: r.value });
  }
  if (errors.length) return { error: errors.slice(0, 5).join("; ") + (errors.length > 5 ? ` и ещё ${errors.length - 5}` : "") };
  const ids = [...touched];
  if (ids.length && mine.length) {
    await db.transaction(async (tx) => {
      await tx
        .delete(s.productAttribute)
        .where(and(inArray(s.productAttribute.productId, ids), inArray(s.productAttribute.attributeId, mine.map((a) => a.id))));
      if (rows.length) await tx.insert(s.productAttribute).values(rows);
    });
  }
  await audit(me.id, "attribute.grid", "category", categoryId, { products: ids.length, values: rows.length });
  revalidatePath("/", "layout");
  return { ok: `Сохранено: ${rows.length} значений у ${ids.length} товаров` };
}
