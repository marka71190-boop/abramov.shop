"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { getActiveConsent, recordConsent, revokeConsent } from "@/lib/consent";
import { getRequestMeta } from "@/lib/request";
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
