/**
 * Магазинные штрихкоды EAN-13 (200…): выдаём каждому активному варианту товара, у которого штрихкода нет.
 * EAN-13 короче Code 128 из артикула и надёжнее читается камерой с маленькой термоэтикетки.
 * Заводской штрихкод (если вписать его в вариант) не трогаем.
 */
import "server-only";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { shopEan } from "@/lib/barcode";

export async function ensureShopBarcodes() {
  const missing = await db
    .select({ id: s.productVariant.id })
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
    for (let attempt = 0; attempt < 5; attempt++) {
      n++;
      try {
        await db.update(s.productVariant).set({ barcode: shopEan(n) }).where(and(eq(s.productVariant.id, v.id), isNull(s.productVariant.barcode)));
        done++;
        break;
      } catch {
        /* занят — следующий */
      }
    }
  }
  return done;
}
