"use server";
import { revalidatePath } from "next/cache";
import type { DecideState } from "@/app/pin/approve/[token]/actions";
import { audit } from "@/lib/audit";
import { ApprovalError, decideApprovalById } from "@/lib/pos-approval";
import { createRateLimiter } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/viewer";

const limit = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

/** Подтвердить или отклонить свой запрос из админки — тем же PIN */
export async function decideByIdAction(id: string, _: DecideState, fd: FormData): Promise<DecideState> {
  const me = await requireAdmin("MANAGER");
  if (!limit(me.id)) return { error: "Слишком много попыток — подождите несколько минут" };
  const decision = fd.get("decision") === "DENY" ? "DENY" : "APPROVE";
  try {
    const r = await decideApprovalById(String(id), me.id, decision, String(fd.get("pin") ?? "").replace(/\D/g, "").slice(0, 6));
    await audit(me.id, r === "APPROVED" ? "pos.approval_ok" : "pos.approval_deny", "user", String(id).slice(0, 64), { via: "admin" });
    revalidatePath("/admin/pos/approvals");
    return r === "APPROVED" ? { ok: "Подтверждено — касса продолжит сама", final: true } : { ok: "Отклонено — касса увидит отказ", final: true };
  } catch (e) {
    return { error: e instanceof ApprovalError ? e.message : "Не получилось — попробуйте ещё раз" };
  }
}
