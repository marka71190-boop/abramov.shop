"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createSupplierOrder, receiveOrder, setOrderStatus, SupplierError, updateDraft } from "@/lib/reorder";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

export type SoResult = { ok?: string; error?: string };

const cost = z.number().int().min(0).max(1_000_000_000).nullable();
const NewIn = z.object({
  supplier: z.string().trim().min(1, "Укажите поставщика").max(120),
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(100_000), unitCost: cost })).min(1, "Отметьте товары").max(300),
});

export async function newSupplierOrder(raw: unknown): Promise<SoResult> {
  const me = await requireAdmin();
  const p = NewIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте заказ" };
  let id: string;
  try {
    const o = await createSupplierOrder(me.id, { supplier: p.data.supplier, note: p.data.note || null, lines: p.data.lines });
    await audit(me.id, "supplier.order_create", "supplier_order", o.id, { number: o.number, supplier: o.supplier, lines: p.data.lines.length });
    id = o.id;
  } catch (e) {
    return { error: e instanceof SupplierError ? e.message : "Не получилось создать заказ" };
  }
  revalidatePath("/admin/stock/reorder");
  redirect(`/admin/stock/orders/${id}`);
}

const Items = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      qty: z.number().int().min(0).max(100_000),
      unitCost: cost,
      supplierCode: z.string().trim().max(32).regex(/^[\p{L}\d\-_./ ]*$/u, "Код поставщика — буквы и цифры").nullable().optional(),
    }),
  )
  .max(300);

export async function saveDraft(id: string, raw: unknown): Promise<SoResult> {
  const me = await requireAdmin();
  const p = z.object({ supplier: z.string().trim().min(1, "Укажите поставщика").max(120), note: z.string().trim().max(500).optional(), items: Items }).safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте строки" };
  try {
    await updateDraft(String(id), { supplier: p.data.supplier, note: p.data.note || null, items: p.data.items });
    await audit(me.id, "supplier.order_edit", "supplier_order", String(id), { items: p.data.items.length });
  } catch (e) {
    return { error: e instanceof SupplierError ? e.message : "Не получилось сохранить" };
  }
  revalidatePath(`/admin/stock/orders/${id}`);
  return { ok: "Сохранено" };
}

export async function orderStatus(id: string, status: "ORDERED" | "CANCELLED"): Promise<SoResult> {
  const me = await requireAdmin();
  try {
    await setOrderStatus(String(id), status);
    await audit(me.id, `supplier.order_${status.toLowerCase()}`, "supplier_order", String(id));
  } catch (e) {
    return { error: e instanceof SupplierError ? e.message : "Не получилось" };
  }
  revalidatePath(`/admin/stock/orders/${id}`);
  revalidatePath("/admin/stock/orders");
  return { ok: status === "ORDERED" ? "Отмечено: заказали у поставщика" : "Заказ отменён" };
}

export async function receive(id: string, raw: unknown): Promise<SoResult> {
  const me = await requireAdmin();
  const p = Items.safeParse(raw);
  if (!p.success) return { error: "Проверьте количество и цены" };
  try {
    const units = await receiveOrder(me.id, String(id), p.data);
    await audit(me.id, "supplier.order_receive", "supplier_order", String(id), { units });
    revalidatePath("/", "layout");
    return { ok: `Принято на склад: ${units} шт` };
  } catch (e) {
    return { error: e instanceof SupplierError ? e.message : e instanceof Error ? e.message : "Не получилось принять" };
  }
}

/** Настройки расчёта «Что докупить» */
export async function saveReorderSettings(_: SoResult, fd: FormData): Promise<SoResult> {
  const me = await requireAdmin();
  const n = (k: string, min: number, max: number) => {
    const v = Math.trunc(Number(fd.get(k)));
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  };
  const leadDays = n("leadDays", 0, 365);
  const coverDays = n("coverDays", 1, 365);
  const salesWindowDays = n("salesWindowDays", 7, 365);
  if (leadDays == null || coverDays == null || salesWindowDays == null) return { error: "Дни — целые числа: поставка 0–365, запас 1–365, продажи за 7–365" };
  const cur = await getSettings();
  await saveSettings({ ...cur, stock: { ...cur.stock, leadDays, coverDays, salesWindowDays } });
  await audit(me.id, "settings.reorder", "setting", "site", { leadDays, coverDays, salesWindowDays });
  revalidatePath("/admin/stock/reorder");
  return { ok: "Сохранено" };
}
