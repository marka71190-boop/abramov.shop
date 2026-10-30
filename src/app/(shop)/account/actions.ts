"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { getActiveConsent, recordConsent, revokeConsent } from "@/lib/consent";
import { requestEmailChange } from "@/lib/email-change";
import { createRateLimiter } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { isPlaceholderEmail } from "@/lib/site";
import { createLinkUrl } from "@/lib/telegram";
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

/** Одноразовая ссылка на бота для привязки Telegram. */
export async function telegramLink(): Promise<string | null> {
  const u = await requireActiveUser();
  return createLinkUrl(u.id);
}

export async function unlinkTelegram() {
  const u = await requireActiveUser();
  await db.update(s.user).set({ telegramChatId: null }).where(eq(s.user.id, u.id));
  revalidatePath("/account");
}

const emailLimit = createRateLimiter({ limit: 5, windowMs: 3600_000 });

/**
 * Настоящая почта для старых аккаунтов VK без почты. В аккаунт она попадает только после
 * перехода по ссылке из письма (см. lib/email-change) — так нельзя занять чужой адрес.
 */
export async function setRealEmail(_: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const u = await requireActiveUser();
  if (!isPlaceholderEmail(u.email)) return { error: "Почта уже указана" };
  if (!emailLimit(u.id)) return { error: "Слишком много попыток — попробуйте через час" };
  const email = String(form.get("email") || "");
  const error = await requestEmailChange(u.id, email).catch((e) => {
    console.error("[mail] email change:", e instanceof Error ? e.message : e);
    return "Не получилось отправить письмо. Попробуйте позже или напишите в поддержку";
  });
  if (error) return { error };
  return { ok: `Отправили письмо на ${email.trim().toLowerCase()}. Откройте его и нажмите «Подтвердить почту» — после этого почта появится в аккаунте.` };
}

/** День рождения — указывается один раз; изменить можно через поддержку. */
export async function setBirthday(_: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const u = await requireActiveUser();
  if (u.birthday) return { error: "Дата уже указана. Чтобы изменить, напишите в поддержку" };
  const v = String(form.get("birthday") || "");
  const d = new Date(`${v}T12:00:00Z`);
  const age = (Date.now() - +d) / (365.25 * 86400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(+d) || age < 14 || age > 110) return { error: "Проверьте дату рождения" };
  await db.update(s.user).set({ birthday: v, birthdaySetAt: new Date() }).where(and(eq(s.user.id, u.id), sql`${s.user.birthday} is null`));
  revalidatePath("/account");
  return { ok: "Сохранено" };
}

/** Как обращаться: имя и отчество («Здравствуйте, Марк Иосифович») */
export async function setNameParts(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const u = await requireActiveUser();
  const clean = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .replace(/[^\p{L}\s'-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  const first = clean(form.get("firstName"));
  const patronymic = clean(form.get("patronymic"));
  if (!first) return { error: "Напишите имя" };
  // В name хранится имя (и фамилия, если человек указывал её при регистрации) — меняем только первое слово
  const rest = u.name.trim().split(/\s+/).slice(1).join(" ");
  await db
    .update(s.user)
    .set({ name: rest ? `${first} ${rest}` : first, patronymic: patronymic || null })
    .where(eq(s.user.id, u.id));
  revalidatePath("/account");
  return { ok: "Сохранено" };
}

/** Отчество сразу после регистрации (форма регистрации) */
export async function setPatronymicAfterSignup(patronymic: string) {
  const u = await requireActiveUser();
  const p = patronymic
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (p) await db.update(s.user).set({ patronymic: p }).where(eq(s.user.id, u.id));
}
