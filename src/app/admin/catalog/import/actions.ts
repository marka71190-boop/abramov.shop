"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { applyProduct, ProductImport, type ApplyResult } from "@/lib/catalog-import";
import { requireAdmin } from "@/lib/viewer";

/** Загрузить пачку товаров (до 10 за раз — чтобы скачивание фото не упиралось во время ожидания). */
export async function applyImportAction(raw: unknown): Promise<{ results?: ApplyResult[]; error?: string }> {
  const me = await requireAdmin();
  const p = z.array(ProductImport).max(10).safeParse(raw);
  if (!p.success) return { error: "Данные устарели — проверьте файл ещё раз" };
  const results: ApplyResult[] = [];
  for (const item of p.data) results.push(await applyProduct(item, me.id));
  const { notifyBackInStock } = await import("@/lib/stock-alerts");
  for (const r of results) if (r.backInStock && r.productId) await notifyBackInStock(r.productId).catch(() => 0);
  return { results };
}

export async function finishImportAction(counts: { created: number; updated: number; failed: number }) {
  const me = await requireAdmin();
  await audit(me.id, "catalog.import", "product", null, counts);
  revalidatePath("/", "layout");
}
