"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { cancelSale, createSale, PosError, refreshSale, type SaleRow } from "@/lib/pos";
import { qrSvg } from "@/lib/qr";
import { withStockNotices } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";

const In = z.object({
  items: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(1000), price: z.number().int().min(0).max(1_000_000_000) })).min(1, "Добавьте товар").max(100),
  discount: z.number().int().min(0).max(1_000_000_000),
  method: z.enum(["CASH", "SBP", "CARD"]),
  place: z.string().trim().max(120).nullable(),
  contact: z.string().trim().max(200).nullish(),
});

export interface SaleView {
  id: string;
  number: string;
  status: string;
  method: string;
  total: number;
  qr: string | null; // SVG
  qrUrl: string | null;
}

async function view(sale: SaleRow): Promise<SaleView> {
  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    method: sale.method,
    total: sale.total,
    qr: sale.status === "PENDING" && sale.qrUrl ? await qrSvg(sale.qrUrl) : null,
    qrUrl: sale.status === "PENDING" ? sale.qrUrl : null,
  };
}

export async function posCreate(raw: unknown): Promise<{ sale?: SaleView; error?: string }> {
  const me = await requireAdmin();
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте продажу" };
  try {
    const sale = await withStockNotices(
      p.data.items.map((i) => i.variantId),
      () => createSale(me.id, p.data),
    );
    await audit(me.id, "pos.sale", "pos_sale", sale.id, { number: sale.number, method: sale.method, total: sale.total });
    revalidatePath("/", "layout");
    return { sale: await view(sale) };
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    console.error("[pos] продажа:", e);
    return { error: "Не получилось провести продажу. Попробуйте ещё раз" };
  }
}

export async function posStatus(id: string): Promise<{ sale?: SaleView; error?: string }> {
  await requireAdmin();
  try {
    const sale = await refreshSale(String(id).slice(0, 64));
    if (!sale) return { error: "Продажа не найдена" };
    if (sale.status !== "PENDING") revalidatePath("/admin/pos");
    return { sale: await view(sale) };
  } catch (e) {
    console.error("[pos] статус:", e instanceof Error ? e.message : e);
    return { error: "Нет связи с ЮKassa — проверим ещё раз" };
  }
}

export async function posCancel(id: string): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  try {
    const before = await refreshSale(String(id).slice(0, 64)).catch(() => null);
    const sale = await cancelSale(String(id).slice(0, 64), me.id);
    if (!sale) return { error: "Продажа не найдена" };
    await audit(me.id, "pos.cancel", "pos_sale", sale.id, { number: sale.number, method: sale.method, total: sale.total, wasPaid: before?.status === "PAID" });
    revalidatePath("/", "layout");
    return {
      ok:
        before?.status === "PAID"
          ? sale.method === "CASH"
            ? `Продажа ${sale.number} отменена, товар вернулся на склад. Верните покупателю наличные`
            : `Продажа ${sale.number} отменена, деньги вернутся покупателю через ЮKassa`
          : `Продажа ${sale.number} отменена`,
    };
  } catch (e) {
    console.error("[pos] отмена:", e);
    return { error: "Не получилось отменить — возможно, ЮKassa не приняла возврат. Попробуйте ещё раз" };
  }
}
