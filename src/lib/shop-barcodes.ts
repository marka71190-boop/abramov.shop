/**
 * Магазинные штрихкоды EAN-13 (200…): выдаём каждому активному варианту товара, у которого штрихкода нет.
 * EAN-13 короче Code 128 из артикула и надёжнее читается камерой с маленькой термоэтикетки.
 * Артикул = штрихкод: у нового варианта без артикула артикулом становится штрихкод (миграция 0060
 * так же перевела все старые, прежний артикул — в old_sku). Заводской штрихкод не трогаем.
 */
import "server-only";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isEan13, shopEan } from "@/lib/barcode";

export async function ensureShopBarcodes() {
  // Штрихкод есть, а артикула нет (вариант добавили без артикула) — артикул = штрихкод
  await db.update(s.productVariant).set({ sku: sql`${s.productVariant.barcode}` }).where(and(isNull(s.productVariant.sku), sql`${s.productVariant.barcode} is not null`)).catch(() => {});
  const missing = await db
    .select({ id: s.productVariant.id, sku: s.productVariant.sku })
    .from(s.productVariant)
    .where(and(eq(s.productVariant.isActive, true), isNull(s.productVariant.barcode)))
    .orderBy(s.productVariant.productId, s.productVariant.sortOrder);
  if (!missing.length) return 0;
  const [last] = await db
    .select({ max: sql<string | null>`max(${s.productVariant.barcode})` })
    .from(s.productVariant)
    .where(like(s.productVariant.barcode, "200%"));
  let n = last?.max ? Number(last.max.slice(3, 12)) : 0;
  let done = 0;
  for (const v of missing) {
    // Гонка с соседним запросом — уникальный индекс не пустит дубль, берём следующий номер
    // В артикул вписали заводской штрихкод — он и будет штрихкодом
    if (isEan13(v.sku)) {
      const ok = await db
        .update(s.productVariant)
        .set({ barcode: v.sku })
        .where(and(eq(s.productVariant.id, v.id), isNull(s.productVariant.barcode)))
        .then(() => true)
        .catch(() => false);
      if (ok) {
        done++;
        continue;
      }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      n++;
      try {
        const code = shopEan(n);
        await db
          .update(s.productVariant)
          .set({ barcode: code, ...(v.sku ? {} : { sku: code }) })
          .where(and(eq(s.productVariant.id, v.id), isNull(s.productVariant.barcode)));
        done++;
        break;
      } catch {
        /* занят — следующий */
      }
    }
  }
  return done;
}

/**
 * Артикул = штрихкод для товаров (после сохранения, копирования, загрузки из Excel):
 * у варианта артикул становится его штрихкодом (прежний — в old_sku), у товара с одним вариантом —
 * артикул товара тоже. Вписали в артикул заводской EAN-13 — он становится штрихкодом.
 */
export async function syncSkuToBarcode(productIds: string[]) {
  const ids = productIds.filter(Boolean);
  if (!ids.length) return;
  const vs = await db.query.productVariant.findMany({ where: inArray(s.productVariant.productId, ids) });
  for (const v of vs) {
    if (isEan13(v.sku) && v.sku !== v.barcode) {
      await db.update(s.productVariant).set({ barcode: v.sku, oldSku: v.oldSku ?? v.barcode }).where(eq(s.productVariant.id, v.id)).catch(() => {});
    }
  }
  await ensureShopBarcodes();
  const fresh = await db.query.productVariant.findMany({ where: inArray(s.productVariant.productId, ids) });
  for (const v of fresh) {
    if (v.barcode && v.sku !== v.barcode)
      await db
        .update(s.productVariant)
        .set({ sku: v.barcode, oldSku: v.oldSku ?? v.sku })
        .where(eq(s.productVariant.id, v.id))
        .catch((e) => console.error("[sku] артикул = штрихкод:", e instanceof Error ? e.message : e));
  }
  const prods = await db.query.product.findMany({ where: inArray(s.product.id, ids), columns: { id: true, sku: true, oldSku: true } });
  for (const p of prods) {
    const active = fresh.filter((v) => v.productId === p.id && v.isActive);
    const code = active.length === 1 ? active[0].barcode : null;
    if (code && p.sku !== code)
      await db
        .update(s.product)
        .set({ sku: code, oldSku: p.oldSku ?? p.sku })
        .where(eq(s.product.id, p.id))
        .catch((e) => console.error("[sku] артикул товара = штрихкод:", e instanceof Error ? e.message : e));
  }
}
