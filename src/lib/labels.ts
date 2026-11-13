/**
 * Данные для этикеток: название, вариант, артикул (штрихкод), цена и ссылка на товар (QR).
 * i=<variantId>:<копий>,… — как на странице «Этикетки».
 */
import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { canBarcode, isEan13 } from "@/lib/barcode";
import { clubTitle } from "@/lib/club-label";
import { ensureShopBarcodes } from "@/lib/shop-barcodes";
import { SITE } from "@/lib/site";

export interface LabelItem {
  id: string;
  name: string;
  variant: string | null;
  sku: string | null;
  /** Что кодируем в штрихкод: EAN-13 товара, а если его нет — артикул (Code 128) */
  code: string;
  price: number; // копейки
  url: string;
  copies: number;
}

/** Подпись клуба для этикетки: «Клуб «Чемпион» · ул. Красная, 176»; пусто — склад, без подписи */
export async function labelClub(id: string | null | undefined) {
  if (!id) return null;
  const c = await db.query.club.findFirst({ where: (t, { eq }) => eq(t.id, id.slice(0, 64)) });
  return c ? clubTitle(c) : null;
}

export function parseLabelQuery(i: string | undefined) {
  return String(i ?? "")
    .split(",")
    .map((x) => x.split(":"))
    .filter(([id, n]) => id && Number(n) > 0)
    .slice(0, 500)
    .map(([id, n]) => ({ id: id.slice(0, 64), n: Math.min(500, Math.trunc(Number(n))) }));
}

export async function labelItems(wanted: { id: string; n: number }[]): Promise<LabelItem[]> {
  const ids = wanted.map((w) => w.id);
  if (!ids.length) return [];
  await ensureShopBarcodes();
  const multi = sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.product.id} and v2.is_active)`;
  const rows = await db
    .select({
      id: s.productVariant.id,
      product: s.product.name,
      slug: s.product.slug,
      variant: s.productVariant.name,
      barcode: s.productVariant.barcode,
      multi,
      sku: sql<string | null>`case when ${multi} > 1 then ${s.productVariant.sku} else coalesce(${s.productVariant.sku}, ${s.product.sku}) end`,
      price: sql<number>`coalesce(${s.productVariant.price}, ${s.product.price})`,
    })
    .from(s.productVariant)
    .innerJoin(s.product, sql`${s.product.id} = ${s.productVariant.productId}`)
    .where(inArray(s.productVariant.id, ids));
  return wanted.flatMap((w) => {
    const r = rows.find((x) => x.id === w.id);
    const code = isEan13(r?.barcode) ? r!.barcode! : r?.sku && canBarcode(r.sku) ? r.sku : null;
    if (!r || !code) return [];
    return [
      {
        id: r.id,
        name: r.product,
        variant: r.multi > 1 ? r.variant : null,
        sku: r.sku,
        code,
        price: Number(r.price),
        // У товара с вариантами ссылка сразу открывает нужный вариант
        url: `${SITE.url}/product/${r.slug}${r.multi > 1 ? `?v=${r.id}` : ""}`,
        copies: w.n,
      },
    ];
  });
}
