/**
 * Подтверждение менеджера для кассы — двумя ключами: доступ к своей почте + свой PIN.
 *
 * 1. Кассир выбирает менеджера и жмёт «Продать» / «Оформить возврат» → создаётся запрос,
 *    менеджеру уходит письмо: что подтверждают, где, кто на смене, сумма.
 * 2. Касса показывает «Ждём подтверждения» и опрашивает статус.
 * 3. Менеджер открывает ссылку у себя, вводит PIN и подтверждает или отклоняет.
 * 4. Касса проводит операцию — только с тем же содержимым чека, что подтвердили.
 * Запрос живёт 10 минут; 5 неверных PIN — PIN блокируется (как в lib/pin).
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";
import { checkPin, PinError } from "@/lib/pin";
import { SITE } from "@/lib/site";

export type ApprovalKind = "DISCOUNT" | "RETURN";
export type ApprovalRow = typeof s.posApproval.$inferSelect;
export type ApprovalDetails = ApprovalRow["details"];

const TTL_MIN = 10;
const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Отпечаток содержимого: ключи по алфавиту, чтобы порядок полей не влиял */
export function payloadHash(v: unknown): string {
  const norm = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(norm) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])])) : x;
  return sha(JSON.stringify(norm(v)));
}

export class ApprovalError extends Error {}

export async function requestApproval(p: { kind: ApprovalKind; sellerId: string; approverId: string; payload: unknown; summary: string; details: ApprovalDetails }) {
  const approver = await db.query.user.findFirst({ where: eq(s.user.id, p.approverId) });
  const staff = approver && !approver.isDevice && !approver.bannedAt && (["OWNER", "MANAGER"].includes(approver.role) || approver.extraRoles.some((r) => r === "OWNER" || r === "MANAGER"));
  if (!approver || !staff) throw new ApprovalError("Выберите менеджера");
  if (!approver.pinHash) throw new ApprovalError(`У ${approver.name} не задан PIN`);
  if (approver.pinLockedAt) throw new ApprovalError(`PIN менеджера ${approver.name} заблокирован — выберите другого`);
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  if (!mailEnabled()) throw new ApprovalError("Почта сайта не настроена — подтверждение отправить некуда");

  // Прежний неотвеченный запрос этого кассира — больше не нужен
  await db.update(s.posApproval).set({ status: "CANCELLED", decidedAt: new Date() }).where(and(eq(s.posApproval.sellerId, p.sellerId), eq(s.posApproval.status, "PENDING")));
  const token = randomBytes(24).toString("hex");
  const [row] = await db
    .insert(s.posApproval)
    .values({
      tokenHash: sha(token),
      kind: p.kind,
      sellerId: p.sellerId,
      approverId: approver.id,
      payloadHash: payloadHash(p.payload),
      summary: p.summary,
      details: p.details,
      expiresAt: new Date(Date.now() + TTL_MIN * 60_000),
    })
    .returning();

  const d = p.details;
  const lines = d.lines.map((l) => `${esc(l.name)} × ${l.qty} — ${rub(l.amount)}`).join("<br>");
  const sent = await sendMail(
    approver.email,
    `Подтвердите в кассе: ${p.summary}`,
    p.kind === "RETURN" ? "Подтвердите возврат" : "Подтвердите скидку",
    `Касса просит вашего подтверждения:<br><br><b>${esc(p.summary)}</b><br><br>${lines}<br><br>` +
      `Касса: ${esc(d.kassa)}${d.staffName ? `<br>На смене: ${esc(d.staffName)}` : ""}${d.place ? `<br>Где: ${esc(d.place)}` : ""}<br><br>` +
      `Откройте ссылку, введите свой PIN и подтвердите или отклоните. Ссылка действует ${TTL_MIN} минут. Если вы ничего не ждали — просто отклоните.`,
    { text: "Подтвердить или отклонить", url: `${SITE.url}/pin/approve/${token}` },
  ).catch((e) => {
    console.error("[pos-approval] письмо:", e instanceof Error ? e.message : e);
    return false;
  });
  if (sent === false) {
    await db.update(s.posApproval).set({ status: "CANCELLED", decidedAt: new Date() }).where(eq(s.posApproval.id, row.id));
    throw new ApprovalError("Не получилось отправить письмо менеджеру — попробуйте ещё раз");
  }
  return { id: row.id, approver: approver.name, expiresAt: row.expiresAt };
}

/** Статус для кассы (только свой запрос) */
export async function approvalStatus(id: string, sellerId: string) {
  const r = await db.query.posApproval.findFirst({ where: and(eq(s.posApproval.id, id), eq(s.posApproval.sellerId, sellerId)) });
  if (!r) return null;
  const expired = r.status === "PENDING" && r.expiresAt < new Date();
  return { status: expired ? "EXPIRED" : r.status, expiresAt: r.expiresAt };
}

export async function cancelApproval(id: string, sellerId: string) {
  await db
    .update(s.posApproval)
    .set({ status: "CANCELLED", decidedAt: new Date() })
    .where(and(eq(s.posApproval.id, id), eq(s.posApproval.sellerId, sellerId), eq(s.posApproval.status, "PENDING")));
}

/**
 * Касса проводит операцию по подтверждению: тот же кассир, тот же вид, то же содержимое.
 * Помечаем USED — второй раз тем же подтверждением не провести. Возвращает id подтвердившего.
 */
export async function consumeApproval(id: string, sellerId: string, kind: ApprovalKind, payload: unknown) {
  const r = await db.query.posApproval.findFirst({ where: and(eq(s.posApproval.id, String(id).slice(0, 64)), eq(s.posApproval.sellerId, sellerId)) });
  if (!r || r.kind !== kind) throw new ApprovalError("Подтверждение не найдено — запросите снова");
  if (r.status === "DENIED") throw new ApprovalError("Менеджер отклонил");
  if (r.status !== "APPROVED") throw new ApprovalError("Менеджер ещё не подтвердил");
  if (Date.now() - +(r.decidedAt ?? r.createdAt) > 15 * 60_000) throw new ApprovalError("Подтверждение устарело — запросите снова");
  if (r.payloadHash !== payloadHash(payload)) throw new ApprovalError("Чек изменился после подтверждения — запросите подтверждение снова");
  const used = await db
    .update(s.posApproval)
    .set({ status: "USED", usedAt: new Date() })
    .where(and(eq(s.posApproval.id, r.id), eq(s.posApproval.status, "APPROVED")))
    .returning({ id: s.posApproval.id });
  if (!used.length) throw new ApprovalError("Это подтверждение уже использовано");
  return r.approverId;
}

/** Страница по ссылке из письма */
export async function approvalByToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const r = await db.query.posApproval.findFirst({ where: eq(s.posApproval.tokenHash, sha(token)) });
  if (!r) return null;
  const approver = await db.query.user.findFirst({ where: eq(s.user.id, r.approverId), columns: { name: true, pinLockedAt: true } });
  return { ...r, approverName: approver?.name ?? "", pinLocked: !!approver?.pinLockedAt, expired: r.status === "PENDING" && r.expiresAt < new Date() };
}

/** Решение менеджера: подтвердить — только с верным PIN; отклонить — PIN не нужен */
export async function decideApproval(token: string, decision: "APPROVE" | "DENY", pin: string) {
  const r = await approvalByToken(token);
  if (!r) throw new ApprovalError("Ссылка недействительна");
  if (r.status !== "PENDING") throw new ApprovalError(r.status === "APPROVED" || r.status === "USED" ? "Уже подтверждено" : r.status === "DENIED" ? "Уже отклонено" : "Кассир отменил запрос");
  if (r.expired) throw new ApprovalError("Время вышло — пусть касса запросит подтверждение снова");
  if (decision === "DENY") {
    await db.update(s.posApproval).set({ status: "DENIED", decidedAt: new Date() }).where(and(eq(s.posApproval.id, r.id), eq(s.posApproval.status, "PENDING")));
    return "DENIED" as const;
  }
  try {
    await checkPin(r.approverId, pin, { action: r.summary, kassa: r.details.kassa, staffName: r.details.staffName, place: r.details.place });
  } catch (e) {
    await db.update(s.posApproval).set({ attempts: r.attempts + 1 }).where(eq(s.posApproval.id, r.id));
    throw e instanceof PinError ? new ApprovalError(e.message) : e;
  }
  const ok = await db
    .update(s.posApproval)
    .set({ status: "APPROVED", decidedAt: new Date() })
    .where(and(eq(s.posApproval.id, r.id), eq(s.posApproval.status, "PENDING"), gt(s.posApproval.expiresAt, new Date())))
    .returning({ id: s.posApproval.id });
  if (!ok.length) throw new ApprovalError("Кассир отменил запрос или время вышло");
  return "APPROVED" as const;
}
