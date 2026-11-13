"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

/** Процент сотруднику с продаж в кассе — только владелец */
export async function staffPercentAction(fd: FormData) {
  const me = await requireAdmin("OWNER");
  const v = Math.round(Number(String(fd.get("percent") ?? "").replace(",", ".")) * 10) / 10;
  if (!(v >= 0 && v <= 50)) return;
  const cur = await getSettings();
  await saveSettings({ ...cur, finance: { ...cur.finance, staffPercent: v } });
  await audit(me.id, "settings.staff_percent", "settings", null, { percent: v });
  revalidatePath("/admin/pos/staff");
}

// ---------- Зарплата: ставки, выплаты, премии и штрафы ----------

type Res = { ok?: string; error?: string };
const rubToKop = (v: unknown) => Math.round(Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")) * 100);

/** Ставка сотрудника: процент от его выручки (пусто — общий). Только владелец */
export async function saveRateAction(raw: { name: string; percent: string }): Promise<Res> {
  const me = await requireAdmin("OWNER");
  const { db, schema: s } = await import("@/db");
  const { staffKey } = await import("@/lib/pos-staff");
  const name = String(raw.name ?? "").trim().slice(0, 80);
  const key = staffKey(name);
  if (!key) return { error: "Сотрудник не найден" };
  const percent = raw.percent.trim() ? Math.round(Number(raw.percent.replace(",", ".")) * 10) / 10 : null;
  if (percent != null && !(percent >= 0 && percent <= 50)) return { error: "Процент — от 0 до 50" };
  await db
    .insert(s.staffRate)
    .values({ key, name, percent })
    .onConflictDoUpdate({ target: s.staffRate.key, set: { name, percent, updatedAt: new Date() } });
  await audit(me.id, "staff.rate", "staff", key, { percent });
  revalidatePath("/admin/pos/staff");
  return { ok: percent == null ? "Свой процент убран — действует общий" : "Процент сохранён" };
}

/** Выплата, премия или штраф за месяц. Владелец и директор */
export async function addPayAction(raw: { name: string; month: string; kind: string; amount: string; note: string }): Promise<Res> {
  const me = await requireAdmin("MONEY");
  const { db, schema: s } = await import("@/db");
  const { staffKey } = await import("@/lib/pos-staff");
  const name = String(raw.name ?? "").trim().slice(0, 80);
  const key = staffKey(name);
  const amount = rubToKop(raw.amount);
  if (!key) return { error: "Сотрудник не найден" };
  if (!/^\d{4}-\d{2}$/.test(raw.month)) return { error: "Месяц не выбран" };
  if (!["PAYOUT", "BONUS", "FINE"].includes(raw.kind)) return { error: "Что это: выплата, премия или штраф?" };
  if (!(amount > 0 && amount <= 100_000_000)) return { error: "Сумма — больше нуля" };
  await db.insert(s.staffPay).values({ key, name, month: raw.month, kind: raw.kind, amount, note: String(raw.note ?? "").trim().slice(0, 200) || null, byId: me.id });
  await audit(me.id, "staff.pay", "staff", key, { month: raw.month, kind: raw.kind, amount });
  revalidatePath("/admin/pos/staff");
  return { ok: raw.kind === "PAYOUT" ? "Выплата записана" : raw.kind === "BONUS" ? "Премия начислена" : "Штраф записан" };
}

/** Удалить ошибочную запись — только владелец */
export async function deletePayAction(id: string): Promise<Res> {
  const me = await requireAdmin("OWNER");
  const { db, schema: s } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const [r] = await db.delete(s.staffPay).where(eq(s.staffPay.id, String(id).slice(0, 64))).returning();
  if (r) await audit(me.id, "staff.pay_delete", "staff", r.key, { month: r.month, kind: r.kind, amount: r.amount });
  revalidatePath("/admin/pos/staff");
  return { ok: "Удалено" };
}

/** Показывать ли кассиру его зарплату в приложении кассы */
export async function payVisibleAction(on: boolean): Promise<Res> {
  const me = await requireAdmin("OWNER");
  const cur = await getSettings();
  await saveSettings({ ...cur, finance: { ...cur.finance, staffPayVisible: !!on } });
  await audit(me.id, "settings.staff_pay_visible", "settings", null, { on: !!on });
  revalidatePath("/admin/pos/staff");
  revalidatePath("/kassa");
  return { ok: on ? "Кассиры видят свою зарплату" : "Скрыто от кассиров" };
}
