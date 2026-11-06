"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/viewer";

export async function toggleCoach(userId: string) {
  const me = await requireAdmin();
  const p = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, userId) });
  if (!p) return;
  await db.update(s.coachProfile).set({ isPublished: !p.isPublished }).where(eq(s.coachProfile.userId, userId));
  await audit(me.id, p.isPublished ? "coach.hide" : "coach.show", "user", userId);
  revalidatePath("/admin/coaches");
  revalidatePath("/trenirovki", "layout");
}

export async function reviewApplication(id: string, decision: "APPROVE" | "REJECT", reply: string): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin("OWNER");
  const { approveApplication, rejectApplication, ApplyError } = await import("@/lib/coach-apply");
  const text = String(reply ?? "").trim().slice(0, 1000) || null;
  try {
    if (decision === "APPROVE") await approveApplication(String(id), me.id, text);
    else await rejectApplication(String(id), me.id, text);
  } catch (e) {
    return { error: e instanceof ApplyError ? e.message : "Не получилось" };
  }
  await audit(me.id, decision === "APPROVE" ? "coach.application_approve" : "coach.application_reject", "coach_application", String(id));
  revalidatePath("/admin/coaches");
  revalidatePath("/trenirovki", "layout");
  return { ok: decision === "APPROVE" ? "Одобрено: тренеру открыт кабинет, ему ушло уведомление" : "Отклонено, заявителю ушёл ответ" };
}
