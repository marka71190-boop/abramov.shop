/**
 * Заканчивается товар: когда остаток варианта опускается до порога (Настройки → «Предупреждать при остатке»),
 * админам с подключённым Telegram приходит сообщение. Один раз — пока остаток снова не станет больше порога.
 * В сообщении только названия товаров и остатки.
 */
import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";

export async function lowStockThreshold() {
  return (await getSettings()).stock.lowThreshold;
}

/** Проверить варианты (по умолчанию — все) и предупредить о новых «заканчивается / закончился». */
export async function checkLowStock(variantIds?: string[]) {
  const limit = await lowStockThreshold();
  if (limit <= 0) return 0;
  const scope = variantIds?.length ? inArray(s.productVariant.id, variantIds) : undefined;

  // Пополнили — снова будем предупреждать, когда закончится
  await db
    .update(s.productVariant)
    .set({ lowStockNotifiedAt: null })
    .where(and(isNotNull(s.productVariant.lowStockNotifiedAt), gt(s.productVariant.stock, limit), scope));

  const rows = await db
    .select({ id: s.productVariant.id, variant: s.productVariant.name, stock: s.productVariant.stock, product: s.product.name, variants: sql<number>`(select count(*)::int from ${s.productVariant} v2 where v2.product_id = ${s.product.id} and v2.is_active)` })
    .from(s.productVariant)
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(and(eq(s.productVariant.isActive, true), ne(s.product.visibility, "DRAFT"), lte(s.productVariant.stock, limit), isNull(s.productVariant.lowStockNotifiedAt), scope));
  if (!rows.length) return 0;

  // Сначала помечаем — чтобы два заказа подряд не прислали одно и то же дважды
  const marked = await db
    .update(s.productVariant)
    .set({ lowStockNotifiedAt: new Date() })
    .where(and(inArray(s.productVariant.id, rows.map((r) => r.id)), isNull(s.productVariant.lowStockNotifiedAt)))
    .returning({ id: s.productVariant.id });
  const fresh = rows.filter((r) => marked.some((m) => m.id === r.id));
  if (!fresh.length) return 0;

  const { esc, notifyAdmins, telegramEnabled } = await import("@/lib/telegram");
  const line = (r: (typeof fresh)[number]) =>
    `• ${esc(r.product)}${r.variants > 1 ? `, ${esc(r.variant)}` : ""} — ${r.stock <= 0 ? "<b>закончился</b>" : `осталось <b>${r.stock}</b>`}`;
  const text = `⚠️ <b>Заканчивается товар</b>\n${fresh.slice(0, 30).map(line).join("\n")}${fresh.length > 30 ? `\n…и ещё ${fresh.length - 30}` : ""}`;
  if (telegramEnabled()) await notifyAdmins(text, { text: "Открыть остатки", url: `${SITE.url}/admin/stock?f=low` });
  else {
    // Без Telegram — письмом владельцу
    const owner = process.env.OWNER_EMAIL?.trim();
    if (owner) {
      const { sendMail } = await import("@/lib/mail");
      const html = fresh.map((r) => line(r).replace(/^• /, "").replace(/<\/?b>/g, "")).join("<br>");
      await sendMail(owner, "Заканчивается товар", "Заканчивается товар", html, { text: "Открыть остатки", url: `${SITE.url}/admin/stock?f=low` }).catch(() => {});
    }
  }
  return fresh.length;
}

export interface StockRow {
  variantId: string;
  productId: string;
  product: string;
  variant: string;
  multi: boolean;
  sku: string | null;
  visibility: string;
  stock: number;
  reserved: number;
  sold30: number;
}

/** Отчёт: остаток, резерв в неоплаченных заказах, продажи за 30 дней. */
export async function stockReport(): Promise<StockRow[]> {
  const rows = await db.execute<{
    variant_id: string;
    product_id: string;
    product: string;
    variant: string;
    variants: number;
    sku: string | null;
    visibility: string;
    stock: number;
    reserved: number;
    sold30: number;
  }>(sql`
    select v.id as variant_id, p.id as product_id, p.name as product, v.name as variant,
      (select count(*)::int from product_variant v2 where v2.product_id = p.id and v2.is_active) as variants,
      coalesce(v.sku, p.sku) as sku, p.visibility::text as visibility, v.stock,
      coalesce((select sum(i.quantity) from order_item i join "order" o on o.id = i.order_id
                where i.variant_id = v.id and o.status = 'AWAITING_PAYMENT'), 0)::int as reserved,
      coalesce((select sum(i.quantity) from order_item i join "order" o on o.id = i.order_id
                where i.variant_id = v.id and o.status in ('PAID','ASSEMBLING','SHIPPED','DELIVERED')
                  and o.paid_at > now() - interval '30 days'), 0)::int as sold30
    from product_variant v join product p on p.id = v.product_id
    where v.is_active
    order by v.stock asc, p.name asc, v.sort_order asc`);
  return rows.rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    product: r.product,
    variant: r.variant,
    multi: r.variants > 1,
    sku: r.sku,
    visibility: r.visibility,
    stock: Number(r.stock),
    reserved: Number(r.reserved),
    sold30: Number(r.sold30),
  }));
}

export async function lowStockCount() {
  const limit = await lowStockThreshold();
  if (limit <= 0) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.productVariant)
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(and(eq(s.productVariant.isActive, true), eq(s.product.visibility, "PUBLISHED"), lte(s.productVariant.stock, limit)));
  return r?.n ?? 0;
}
