"use server";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { nextSku } from "@/lib/sku";
import { requireAdmin } from "@/lib/viewer";

/**
 * Артикулы для штрихкодов: товарам без артикула — следующий по категории (CUE-0012),
 * вариантам товара с несколькими вариантами — «артикул товара-номер» (MERCH-0003-2).
 */
export async function fillLabelSkus(): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  let products = 0;
  let variants = 0;
  const noSku = await db.query.product.findMany({ where: isNull(s.product.sku), columns: { id: true, categoryId: true } });
  for (const p of noSku) {
    const sku = await nextSku(p.categoryId);
    await db.update(s.product).set({ sku }).where(eq(s.product.id, p.id));
    products++;
  }
  const all = await db.query.product.findMany({ columns: { id: true, sku: true }, with: { variants: { columns: { id: true, sku: true, sortOrder: true, isActive: true } } } });
  for (const p of all) {
    const active = p.variants.filter((v) => v.isActive);
    if (active.length < 2 || !p.sku) continue;
    for (const [i, v] of [...active].sort((a, b) => a.sortOrder - b.sortOrder).entries()) {
      if (v.sku) continue;
      // Артикул уникален: если занят — добавляем букву
      for (const suffix of ["", "A", "B", "C", "D"]) {
        const ok = await db
          .update(s.productVariant)
          .set({ sku: `${p.sku}-${i + 1}${suffix}` })
          .where(eq(s.productVariant.id, v.id))
          .then(() => true)
          .catch(() => false);
        if (ok) {
          variants++;
          break;
        }
      }
    }
  }
  await audit(me.id, "product.fill_label_sku", "product", null, { products, variants });
  revalidatePath("/admin/stock/labels");
  return { ok: products + variants ? `Проставлено артикулов: товарам ${products}, вариантам ${variants}` : "У всех товаров уже есть артикулы" };
}
