"use server";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { listAttributes, normalizeAttr } from "@/lib/attributes";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/lib/viewer";

const rubToKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);

/** Свободный адрес: kiy-taom → kiy-taom-2, -3… */
async function freeSlug(base: string) {
  const root = (slugify(base) || "tovar").slice(0, 70);
  const taken = new Set(
    (await db.select({ slug: s.product.slug }).from(s.product).where(inArray(s.product.slug, [root, ...Array.from({ length: 40 }, (_, i) => `${root}-${i + 2}`)]))).map(
      (r) => r.slug,
    ),
  );
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** «Создать похожий»: копия со всеми характеристиками и фото — черновиком, с новым артикулом */
export async function duplicateProduct(id: string) {
  const me = await requireAdmin();
  const src = await db.query.product.findFirst({ where: eq(s.product.id, id), with: { variants: true, images: true } });
  if (!src) return;
  const [attrs, related] = await Promise.all([
    db.select().from(s.productAttribute).where(eq(s.productAttribute.productId, id)),
    db.select().from(s.productRelated).where(eq(s.productRelated.productId, id)),
  ]);
  const { id: _id, slug: _slug, sku: _sku, previewToken: _pt, createdAt: _c, updatedAt: _u, variants, images, ...rest } = src;
  void [_id, _slug, _sku, _pt, _c, _u];
  const name = `${src.name} (копия)`;
  const slug = await freeSlug(src.slug);
  const { nextSku } = await import("@/lib/sku");
  const sku = await nextSku(src.categoryId);
  const newId = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(s.product)
      .values({ ...rest, name, slug, sku, visibility: "DRAFT", publishAt: null })
      .returning({ id: s.product.id });
    const vmap = new Map<string, string>();
    for (const v of variants) {
      const [nv] = await tx
        .insert(s.productVariant)
        .values({ productId: p.id, name: v.name, sku: variants.length > 1 ? `${sku}-${v.sortOrder + 1}` : null, price: v.price, stock: src.isUnique ? 1 : 0, isActive: v.isActive, sortOrder: v.sortOrder })
        .returning({ id: s.productVariant.id });
      vmap.set(v.id, nv.id);
    }
    if (images.length)
      await tx.insert(s.productImage).values(images.map((im) => ({ productId: p.id, url: im.url, alt: im.alt, sortOrder: im.sortOrder, variantId: im.variantId ? (vmap.get(im.variantId) ?? null) : null })));
    if (attrs.length) await tx.insert(s.productAttribute).values(attrs.map((a) => ({ productId: p.id, attributeId: a.attributeId, value: a.value })));
    if (related.length) await tx.insert(s.productRelated).values(related.map((r) => ({ productId: p.id, relatedId: r.relatedId, sortOrder: r.sortOrder })));
    return p.id;
  });
  await audit(me.id, "product.duplicate", "product", newId, { from: id });
  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog/product/${newId}?copied=1`);
}

// ---------------------------------------------------------------- быстрое добавление кия

const CueIn = z.object({
  name: z.string().trim().min(2, "Введите название").max(200),
  categoryId: z.string().min(1, "Выберите категорию"),
  price: z.string().refine((v) => rubToKop(v) >= 100, "Укажите цену в рублях"),
  oldPrice: z.string().optional(),
  qty: z.coerce.number().int().min(0).max(1000).default(1),
  description: z.string().max(20_000).default(""),
  publish: z.enum(["PUBLISHED", "DRAFT"]),
  images: z.string(),
  attrs: z.string().max(20_000),
  construction: z.string().max(60).default(""),
});

export type QuickState = { error?: string; ok?: { id: string; slug: string; previewToken: string; name: string; published: boolean } };

export async function quickCue(_: QuickState, form: FormData): Promise<QuickState> {
  const me = await requireAdmin();
  const p = CueIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const images = z.array(z.string().regex(/^\/media\/[0-9a-f-]{36}$/)).max(30).safeParse(JSON.parse(d.images || "[]"));
  if (!images.success) return { error: "Ошибка в списке фото" };
  if (d.publish === "PUBLISHED" && !images.data.length) return { error: "Добавьте хотя бы одно фото — без фото кий не купят. Или сохраните черновиком" };
  const oldPrice = d.oldPrice?.trim() ? rubToKop(d.oldPrice) : null;
  if (oldPrice != null && oldPrice <= rubToKop(d.price)) return { error: "Старая цена должна быть больше текущей — или оставьте поле пустым" };

  // Характеристики по ключам; нового мастера/бренда добавляем в справочник
  const raw = z.record(z.string(), z.string().max(200)).safeParse(JSON.parse(d.attrs || "{}"));
  if (!raw.success) return { error: "Ошибка в характеристиках" };
  const defs = await listAttributes();
  const rows: { attributeId: string; value: string }[] = [];
  for (const [key, val] of Object.entries(raw.data)) {
    const def = defs.find((x) => x.key === key);
    const v = val.trim();
    if (!def || !v) continue;
    if (def.type === "select" && key === "brand" && !def.options.includes(v)) {
      await db.update(s.attribute).set({ options: [...def.options, v] }).where(eq(s.attribute.id, def.id));
      def.options = [...def.options, v];
    }
    const r = normalizeAttr(def, v);
    if ("error" in r) return { error: r.error };
    if (r.value != null) rows.push({ attributeId: def.id, value: r.value });
  }

  // Упаковка для СДЭК — по конструкции
  const box = /3\/4/.test(d.construction) ? { lengthCm: 115, widthCm: 12, heightCm: 12 } : /1\/2/.test(d.construction) ? { lengthCm: 85, widthCm: 12, heightCm: 12 } : { lengthCm: 150, widthCm: 10, heightCm: 10 };
  const name = d.name.replace(/\s+/g, " ");
  const slug = await freeSlug(name);
  const { nextSku } = await import("@/lib/sku");
  const sku = await nextSku(d.categoryId);
  const [prod] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(s.product)
      .values({
        name,
        slug,
        sku,
        categoryId: d.categoryId,
        description: d.description.trim(),
        price: rubToKop(d.price),
        oldPrice,
        visibility: d.publish,
        isUnique: d.qty <= 1,
        weightGrams: 1500,
        ...box,
      })
      .returning();
    const pid = created[0].id;
    await tx.insert(s.productVariant).values({ productId: pid, name: "Основной", stock: d.qty, isActive: true, sortOrder: 0 });
    if (images.data.length) await tx.insert(s.productImage).values(images.data.map((url, i) => ({ productId: pid, url, alt: name, sortOrder: i })));
    if (rows.length) await tx.insert(s.productAttribute).values(rows.map((r) => ({ ...r, productId: pid })));
    return created;
  });
  await audit(me.id, "product.create", "product", prod.id, { slug, quick: true, visibility: d.publish });
  revalidatePath("/", "layout");
  return { ok: { id: prod.id, slug: prod.slug, previewToken: prod.previewToken, name, published: d.publish === "PUBLISHED" } };
}

/** Проставить артикулы всем товарам без артикула (и вариантам, если их несколько) */
export async function fillMissingSkus() {
  const me = await requireAdmin();
  const { isNull } = await import("drizzle-orm");
  const { nextSku } = await import("@/lib/sku");
  const list = await db.query.product.findMany({ where: isNull(s.product.sku), columns: { id: true, categoryId: true }, with: { variants: { columns: { id: true, sku: true, sortOrder: true } } } });
  for (const p of list) {
    const sku = await nextSku(p.categoryId);
    await db.update(s.product).set({ sku }).where(eq(s.product.id, p.id));
    if (p.variants.length > 1)
      for (const v of p.variants.filter((x) => !x.sku)) await db.update(s.productVariant).set({ sku: `${sku}-${v.sortOrder + 1}` }).where(eq(s.productVariant.id, v.id)).catch(() => {});
  }
  await audit(me.id, "product.fill_sku", "product", null, { count: list.length });
  revalidatePath("/admin/catalog");
}
