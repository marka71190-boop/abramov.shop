"use server";
import { revalidatePath } from "next/cache";
import { approveReturn, completeReturn, receiveReturn, refundReturn, rejectReturn, ReturnError, saveConclusion } from "@/lib/returns";
import { requireAdmin } from "@/lib/viewer";

export type ReturnActionState = { error?: string; ok?: string };

async function run(id: string, fn: (actorId: string) => Promise<unknown>, ok: string, level: "MANAGER" | "OWNER" = "MANAGER"): Promise<ReturnActionState> {
  const me = await requireAdmin(level);
  try {
    await fn(me.id);
  } catch (e) {
    if (e instanceof ReturnError) return { error: e.message };
    console.error("[returns]", e);
    return { error: e instanceof Error ? e.message : "Не получилось" };
  }
  revalidatePath(`/admin/returns/${id}`);
  revalidatePath("/admin/returns");
  return { ok };
}

export async function approveAction(id: string, answer: string) {
  return run(id, (a) => approveReturn(id, a, answer), "Одобрено — покупатель получил инструкцию");
}
export async function rejectAction(id: string, answer: string) {
  return run(id, (a) => rejectReturn(id, a, answer), "Заявка отклонена, покупатель получил причину");
}
export async function receiveAction(id: string, restock: boolean) {
  return run(id, (a) => receiveReturn(id, a, restock), "Отмечено: товар получен");
}
export async function refundAction(id: string, rubles: number, restock: boolean, returnBonuses: boolean, answer: string) {
  if (!Number.isFinite(rubles) || rubles < 0) return { error: "Укажите сумму в рублях" };
  return run(id, (a) => refundReturn(id, a, { amount: Math.round(rubles * 100), restock, returnBonuses, answer }), "Деньги возвращены, заявка завершена", "OWNER");
}
export async function conclusionAction(id: string, text: string) {
  return run(id, (a) => saveConclusion(id, a, text), "Заключение сохранено — покупатель увидит его в кабинете");
}
export async function completeAction(id: string, answer: string, restock: boolean) {
  return run(id, (a) => completeReturn(id, a, answer, restock), "Заявка завершена");
}
