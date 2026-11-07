"use server";
import { audit } from "@/lib/audit";
import { ApprovalError, approvalByToken, decideApproval } from "@/lib/pos-approval";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";

export type DecideState = { ok?: string; error?: string; final?: boolean };

const limit = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

export async function decideAction(token: string, _: DecideState, fd: FormData): Promise<DecideState> {
  if (!limit((await getRequestMeta()).ip ?? "unknown")) return { error: "Слишком много попыток — подождите несколько минут" };
  const decision = fd.get("decision") === "DENY" ? "DENY" : "APPROVE";
  try {
    const r = await decideApproval(String(token).slice(0, 64), decision, String(fd.get("pin") ?? "").replace(/\D/g, "").slice(0, 6));
    const row = await approvalByToken(token);
    if (row) await audit(row.approverId, r === "APPROVED" ? "pos.approval_ok" : "pos.approval_deny", "user", row.id, { kind: row.kind, summary: row.summary });
    return r === "APPROVED" ? { ok: "Подтверждено — касса продолжит сама", final: true } : { ok: "Отклонено — касса увидит отказ", final: true };
  } catch (e) {
    return { error: e instanceof ApprovalError ? e.message : "Не получилось — попробуйте ещё раз" };
  }
}
