"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { getActiveConsent, recordConsent, revokeConsent } from "@/lib/consent";
import { getRequestMeta } from "@/lib/request";
import { isPlaceholderEmail } from "@/lib/site";
import { requireActiveUser } from "@/lib/viewer";

/** Переключатель «Новости и акции»: включение пишет согласие в журнал, выключение — отзыв. */
export async function setMarketing(enabled: boolean) {
  const u = await requireActiveUser();
  const meta = await getRequestMeta();
  const active = await getActiveConsent(u.id, "MARKETING");
  if (enabled && !active) {
    await recordConsent({ kind: "MARKETING", source: "ACCOUNT", userId: u.id, name: u.name, email: u.email, phone: u.phone, ...meta });
  } else if (!enabled && active) {
    await revokeConsent(u.id, "MARKETING", meta.ip);
  }
  revalidatePath("/account");
}

export async function setTelegramNotify(enabled: boolean) {
  const u = await requireActiveUser();
  await db.update(s.user).set({ notifyTelegram: enabled }).where(eq(s.user.id, u.id));
  revalidatePath("/account");
}

/** Настоящая почта для тех, кто вошёл через VK без почты: на неё придут чеки и статусы заказов. */
export async function setRealEmail(_: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const u = await requireActiveUser();
  if (!isPlaceholderEmail(u.email)) return { error: "Почта уже указана" };
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || isPlaceholderEmail(email)) return { error: "Проверьте адрес почты" };
  const taken = await db.query.user.findFirst({
    where: and(eq(sql`lower(${s.user.email})`, email), ne(s.user.id, u.id)),
    columns: { id: true },
  });
  if (taken) return { error: "Эта почта уже привязана к другому аккаунту. Войдите в него или напишите в поддержку." };
  await db.update(s.user).set({ email, emailVerified: false }).where(eq(s.user.id, u.id));
  revalidatePath("/account");
  return { ok: "Почта сохранена" };
}
