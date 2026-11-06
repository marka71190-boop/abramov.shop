"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

export type FormState = { ok?: string; error?: string };

const ExpenseIn = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"),
  category: z.string().trim().min(1, "Выберите категорию").max(60),
  amount: z
    .string()
    .transform((v) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100))
    .pipe(z.number().int().min(1, "Сумма — от 0,01 ₽").max(10_000_000_000, "Слишком большая сумма")),
  note: z.string().trim().max(300).optional(),
});

export async function addExpense(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin("OWNER");
  const p = ExpenseIn.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте расход" };
  if (/закупк|товар/i.test(p.data.category)) return { error: "Закупку товара вносите приходом на складе — тогда она станет себестоимостью проданного, а не расходом" };
  const [row] = await db.insert(s.expense).values({ ...p.data, note: p.data.note || null, userId: me.id }).returning();
  await audit(me.id, "finance.expense_add", "expense", row.id, { category: row.category, amount: row.amount, day: row.day });
  revalidatePath("/admin/finance");
  return { ok: "Расход добавлен" };
}

export async function deleteExpense(id: string): Promise<FormState> {
  const me = await requireAdmin("OWNER");
  const [row] = await db.delete(s.expense).where(eq(s.expense.id, String(id).slice(0, 64))).returning();
  if (row) await audit(me.id, "finance.expense_delete", "expense", row.id, { category: row.category, amount: row.amount, day: row.day });
  revalidatePath("/admin/finance");
  return { ok: "Удалено" };
}

const pct = z.coerce.number().min(0).max(50);
const SettingsIn = z.object({
  feeYookassa: pct,
  feeSbp: pct,
  feeRobokassa: pct,
  taxPercent: pct,
  dailyReport: z.literal("on").optional(),
  reportHour: z.coerce.number().int().min(0).max(23),
});

export async function saveFinanceSettings(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin("OWNER");
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v.replace(",", ".") : v]));
  const p = SettingsIn.safeParse(raw);
  if (!p.success) return { error: "Проценты — от 0 до 50, час — от 0 до 23" };
  const cur = await getSettings();
  const finance = { ...cur.finance, ...p.data, dailyReport: p.data.dailyReport === "on" };
  await saveSettings({ ...cur, finance });
  await audit(me.id, "settings.finance", "setting", "site", finance);
  revalidatePath("/admin/finance");
  return { ok: "Сохранено" };
}
