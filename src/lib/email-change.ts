/**
 * Настоящая почта для старых аккаунтов VK без почты (вход через VK убран).
 * Адрес попадает в аккаунт только после перехода по ссылке из письма на этот адрес — и только
 * в том же аккаунте, который его запросил. Так нельзя занять чужую почту.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, like, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { isPlaceholderEmail, PLACEHOLDER_DOMAIN, SITE } from "@/lib/site";

const PREFIX = "set-email:";
const TTL_DAYS = 3;

export type EmailChangeError = "INVALID_TOKEN" | "INVALID_USER" | "EMAIL_TAKEN";

const taken = (email: string, userId: string) =>
  db.query.user.findFirst({ where: and(eq(sql`lower(${s.user.email})`, email), ne(s.user.id, userId)), columns: { id: true } });

/** Письмо со ссылкой на новый адрес. Возвращает текст ошибки для покупателя или null. */
export async function requestEmailChange(userId: string, rawEmail: string): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200 || isPlaceholderEmail(email)) return "Проверьте адрес почты";
  if (!mailEnabled()) return "Почта на сайте пока не настроена — напишите в поддержку";
  if (await taken(email, userId)) return "Эта почта уже привязана к другому аккаунту. Войдите в него или напишите в поддержку.";
  const token = randomBytes(24).toString("base64url");
  // Действует только последняя ссылка
  await db.delete(s.verification).where(like(s.verification.identifier, `${PREFIX}${userId}:%`));
  await db.insert(s.verification).values({
    id: crypto.randomUUID(),
    identifier: `${PREFIX}${userId}:${email}`,
    value: token,
    expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000),
  });
  const url = `${SITE.url}/api/account/confirm-email?token=${token}`;
  await sendMail(
    email,
    "Подтвердите почту — Abramov Shop",
    "Подтвердите почту",
    `Для аккаунта на abramov.shop указали адрес <b>${escHtml(email)}</b>. Нажмите кнопку ниже, чтобы подтвердить, что это ваша почта.` +
      `<br><br>Ссылка действует ${TTL_DAYS} дня. Если это были не вы — просто проигнорируйте письмо.`,
    { text: "Подтвердить почту", url },
  );
  return null;
}

/** Переход по ссылке из письма: записываем почту в аккаунт того, кто её запросил. */
export async function confirmEmailChange(token: string, userId: string): Promise<EmailChangeError | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return "INVALID_TOKEN";
  const v = await db.query.verification.findFirst({
    where: and(eq(s.verification.value, token), like(s.verification.identifier, `${PREFIX}%`), gt(s.verification.expiresAt, new Date())),
  });
  if (!v) return "INVALID_TOKEN";
  const [owner, ...rest] = v.identifier.slice(PREFIX.length).split(":");
  const email = rest.join(":");
  if (owner !== userId) return "INVALID_USER";
  if (await taken(email, userId)) return "EMAIL_TAKEN";
  const u = await db
    .update(s.user)
    .set({ email, emailVerified: true })
    .where(and(eq(s.user.id, userId), like(s.user.email, `%@${PLACEHOLDER_DOMAIN}`)))
    .returning({ id: s.user.id })
    .then((r) => r[0])
    // Почту успели занять другим аккаунтом (уникальный индекс)
    .catch(() => "taken" as const);
  if (u === "taken") return "EMAIL_TAKEN";
  await db.delete(s.verification).where(eq(s.verification.id, v.id));
  if (!u) return "INVALID_TOKEN"; // почту уже указали
  const { grantWelcomeBonus } = await import("@/lib/bonuses");
  await grantWelcomeBonus(userId).catch((e) => console.error("[bonus] welcome:", e));
  return null;
}
