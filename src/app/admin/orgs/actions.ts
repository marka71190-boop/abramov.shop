"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { requireAdmin } from "@/lib/viewer";
import { setOrgStatus } from "@/lib/wholesale";

export type OrgResult = { ok?: string; error?: string };

export async function orgDecision(id: string, status: "APPROVED" | "REJECTED" | "BLOCKED", reason: string): Promise<OrgResult> {
  const me = await requireAdmin();
  if (status !== "APPROVED" && !reason.trim()) return { error: "Напишите причину — её увидит организация" };
  await setOrgStatus(id, status, me.id, reason);
  revalidatePath("/admin/orgs");
  revalidatePath(`/admin/orgs/${id}`);
  return { ok: status === "APPROVED" ? "Одобрено — организации отправлено письмо" : status === "REJECTED" ? "Отклонено — письмо отправлено" : "Доступ закрыт" };
}

/** Добавить сотрудника организации по почте его аккаунта */
export async function addMember(id: string, email: string): Promise<OrgResult> {
  const me = await requireAdmin();
  const u = await db.query.user.findFirst({ where: eq(s.user.email, email.trim().toLowerCase()) });
  if (!u) return { error: "Аккаунт с такой почтой не найден — пусть сотрудник сначала зарегистрируется на сайте" };
  if (u.organizationId && u.organizationId !== id) return { error: "Этот аккаунт уже привязан к другой организации" };
  await db.update(s.user).set({ organizationId: id }).where(eq(s.user.id, u.id));
  await auditSystem(me.id, "org.member_add", "organization", id, { userId: u.id });
  revalidatePath(`/admin/orgs/${id}`);
  return { ok: `${u.name} добавлен` };
}

export async function removeMember(id: string, userId: string): Promise<OrgResult> {
  const me = await requireAdmin();
  await db.update(s.user).set({ organizationId: null }).where(and(eq(s.user.id, userId), eq(s.user.organizationId, id)));
  await auditSystem(me.id, "org.member_remove", "organization", id, { userId });
  revalidatePath(`/admin/orgs/${id}`);
  return { ok: "Убран из организации" };
}
