import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { COACH_AGREEMENT_TITLE, COACH_AGREEMENT_VERSION, coachAgreementBody } from "@/content/coach-agreement";

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

const secret = () => process.env.BETTER_AUTH_SECRET || "dev";
const hashCode = (id: string, code: string) => createHmac("sha256", secret()).update(`${id}:${code}`).digest("hex");
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

export class AgreementError extends Error {}

/** Действующее подписанное соглашение текущей редакции */
export async function signedAgreement(coachId: string) {
  return db.query.coachAgreement.findFirst({
    where: and(eq(s.coachAgreement.coachId, coachId), eq(s.coachAgreement.version, COACH_AGREEMENT_VERSION), isNotNull(s.coachAgreement.signedAt), isNull(s.coachAgreement.revokedAt)),
    orderBy: desc(s.coachAgreement.signedAt),
  });
}

/** Последнее подписанное (любой редакции) — для админки */
export async function lastSigned(coachId: string) {
  return db.query.coachAgreement.findFirst({
    where: and(eq(s.coachAgreement.coachId, coachId), isNotNull(s.coachAgreement.signedAt)),
    orderBy: desc(s.coachAgreement.signedAt),
  });
}

const today = () => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(new Date());

/** Шаг 1: тренер заполнил реквизиты — собираем текст и шлём код на его почту */
export async function startSigning(coach: { id: string; email: string }, input: { fullName: string; taxStatus: string; inn: string | null; phone: string }) {
  // Не чаще раза в минуту: письмо с кодом — не спам-канал
  const last = await db.query.coachAgreement.findFirst({ where: eq(s.coachAgreement.coachId, coach.id), orderBy: desc(s.coachAgreement.createdAt) });
  if (last && !last.signedAt && +last.createdAt > Date.now() - 60_000) throw new AgreementError("Код уже отправлен — подождите минуту перед повторной отправкой");
  const body = coachAgreementBody({ ...input, email: coach.email, date: today() });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await db
    .insert(s.coachAgreement)
    .values({
      coachId: coach.id,
      version: COACH_AGREEMENT_VERSION,
      fullName: input.fullName,
      taxStatus: input.taxStatus,
      inn: input.inn,
      phone: input.phone,
      email: coach.email,
      body,
      sha256: sha(body),
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    })
    .returning();
  await db.update(s.coachAgreement).set({ codeHash: hashCode(row.id, code) }).where(eq(s.coachAgreement.id, row.id));
  const { sendMail } = await import("@/lib/mail");
  await sendMail(
    coach.email,
    `Код для подписания соглашения: ${code}`,
    "Подписание соглашения",
    `Код для подписания «${COACH_AGREEMENT_TITLE}» в кабинете тренера:<br><br><b style="font-size:28px;letter-spacing:6px">${code}</b><br><br>Код действует ${CODE_TTL_MIN} минут. Вводя его, вы подписываете соглашение простой электронной подписью.<br>Если вы ничего не подписывали — просто проигнорируйте письмо и смените пароль от аккаунта.`,
  );
  return { id: row.id, body };
}

/** Шаг 2: код из письма — подпись */
export async function confirmSigning(coachId: string, id: string, code: string, meta: { ip: string | null; userAgent: string | null }) {
  const row = await db.query.coachAgreement.findFirst({ where: and(eq(s.coachAgreement.id, id), eq(s.coachAgreement.coachId, coachId)) });
  if (!row || row.signedAt) throw new AgreementError("Начните подписание заново");
  if (!row.codeHash || !row.codeExpiresAt || row.codeExpiresAt < new Date()) throw new AgreementError("Код истёк — отправьте новый");
  if (row.codeAttempts >= MAX_ATTEMPTS) throw new AgreementError("Слишком много попыток — отправьте новый код");
  await db.update(s.coachAgreement).set({ codeAttempts: row.codeAttempts + 1 }).where(eq(s.coachAgreement.id, id));
  const a = Buffer.from(hashCode(id, code.trim()));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AgreementError("Неверный код");
  await db
    .update(s.coachAgreement)
    .set({ signedAt: new Date(), signIp: meta.ip, signUserAgent: meta.userAgent?.slice(0, 400) ?? null, codeHash: null })
    .where(eq(s.coachAgreement.id, id));
  // Копия подписанного — тренеру на почту
  const { sendMail } = await import("@/lib/mail");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  void sendMail(row.email, `Подписано: ${COACH_AGREEMENT_TITLE}`, COACH_AGREEMENT_TITLE, esc(row.body).replace(/\n/g, "<br>").replace(/## (.+?)<br>/g, "<b>$1</b><br>")).catch(() => {});
  return row;
}
