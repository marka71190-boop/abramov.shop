"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { currentShift } from "@/lib/pos-shifts";
import { applyCount, cancelCount, countClubs, CountError, getCount, openCount, saveCount, submitCount } from "@/lib/stock-count";
import { requireAdmin, requireCashier } from "@/lib/viewer";

export type CountResult = { ok?: string; error?: string };
const msg = (e: unknown, fallback: string) => (e instanceof CountError || (e instanceof Error && /[а-я]/i.test(e.message)) ? e.message : fallback);

/** Начать или продолжить ревизию: кассир — в своём клубе, менеджер — в любом клубе со своим учётом */
export async function countStartAction(fd: FormData) {
  const { me, admin } = await requireCashier();
  const clubId = String(fd.get("clubId") ?? "").slice(0, 64);
  const allowed = await countClubs(admin || !me.clubIds.length ? null : me.clubIds);
  if (!allowed.some((c) => c.id === clubId)) redirect(admin ? "/admin/stock/count?err=club" : "/kassa/count?err=club");
  const shift = await currentShift(me.id);
  const staff = String(fd.get("staffName") ?? "").trim() || shift?.staffName || (me.isDevice ? null : me.name);
  const c = await openCount(me.id, clubId, staff);
  redirect(admin && !me.isDevice ? `/admin/stock/count/${c.id}` : `/kassa/count/${c.id}`);
}

export async function countSaveAction(id: string, counts: Record<string, number>): Promise<CountResult> {
  const { me } = await requireCashier();
  try {
    await saveCount(String(id).slice(0, 64), me.id, counts ?? {});
    return { ok: "Сохранено" };
  } catch (e) {
    return { error: msg(e, "Не сохранилось — проверьте интернет") };
  }
}

export async function countSubmitAction(id: string, counts: Record<string, number>, full: boolean, note: string): Promise<CountResult> {
  const { me } = await requireCashier();
  try {
    const r = await submitCount(String(id).slice(0, 64), me.id, { counts: counts ?? {}, full: !!full, note: String(note ?? "") });
    await audit(me.id, "stock.count_submit", "stock_count", r.id, { units: Object.values(r.counts).reduce((a, x) => a + x, 0) });
    revalidatePath("/admin/stock/count");
    return { ok: "Отправлено менеджеру — он сверит и проведёт" };
  } catch (e) {
    return { error: msg(e, "Не получилось отправить") };
  }
}

export async function countApplyAction(id: string, full: boolean): Promise<CountResult> {
  const me = await requireAdmin();
  try {
    const r = await applyCount(String(id).slice(0, 64), me.id, !!full);
    await audit(me.id, "stock.count_apply", "stock_count", String(id).slice(0, 64), r);
    revalidatePath("/", "layout");
    return { ok: r.lines ? `Проведено: ${r.lines} поз. Недостача ${r.minus} шт, излишки ${r.plus} шт` : "Расхождений нет — остатки сошлись" };
  } catch (e) {
    return { error: msg(e, "Не получилось провести") };
  }
}

export async function countCancelAction(id: string): Promise<CountResult> {
  const { me, admin } = await requireCashier();
  const c = await getCount(String(id).slice(0, 64));
  if (!c) return { error: "Ревизия не найдена" };
  if (admin) await requireAdmin();
  await cancelCount(c.id, me.id, admin);
  await audit(me.id, "stock.count_cancel", "stock_count", c.id, {});
  revalidatePath("/admin/stock/count");
  return { ok: "Ревизия отменена" };
}
