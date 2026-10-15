/**
 * Резервная копия базы в одном файле (JSON, сжатый gzip).
 * Восстановление: node scripts/restore.mjs файл.json.gz (см. README).
 * Сессии входа и одноразовые коды не сохраняем — после восстановления все просто войдут заново.
 */
import "server-only";
import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Порядок важен: при восстановлении таблицы заполняются сверху вниз. */
export const BACKUP_TABLES = [
  "user",
  "account",
  "consent_document",
  "consent",
  "page",
  "category",
  "product",
  "product_variant",
  "product_image",
  "media",
  "promo_code",
  "order",
  "order_item",
  "payment",
  "promo_usage",
  "bonus_transaction",
  "address",
  "favorite",
  "review",
  "stock_subscription",
  "setting",
  "audit_log",
  "saved_cart",
  "campaign",
  "campaign_recipient",
] as const;

export async function createBackup(opts: { withMedia: boolean }) {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    if (t === "media" && !opts.withMedia) continue;
    const r = await db.execute<{ row: unknown }>(sql.raw(`select to_jsonb(t) as row from "${t}" t`));
    tables[t] = r.rows.map((x) => x.row);
  }
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const json = JSON.stringify({ format: "abramov-shop-backup", version: 1, createdAt: new Date().toISOString(), withMedia: opts.withMedia, counts, tables });
  return { gz: gzipSync(json), counts };
}
