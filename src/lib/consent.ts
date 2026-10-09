import "server-only";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** Cookie, которую ставим в момент отметки галочки — до создания аккаунта. */
export const CONSENT_COOKIE = "as_consent";
/** Сколько живёт отметка без созданного аккаунта (уход на Google и обратно). */
export const CONSENT_TTL_MIN = 30;

export type ConsentKind = "PERSONAL_DATA" | "MARKETING";
export type ConsentSource = "REGISTRATION" | "GOOGLE" | "CHECKOUT" | "ACCOUNT" | "RECONSENT";

export async function getCurrentDocument(kind: ConsentKind) {
  const doc = await db.query.consentDocument.findFirst({
    where: and(eq(s.consentDocument.kind, kind), eq(s.consentDocument.isCurrent, true)),
    orderBy: desc(s.consentDocument.createdAt),
  });
  if (!doc) throw new Error(`Нет текущей редакции согласия ${kind}. Запустите npm run db:seed.`);
  return doc;
}

interface RecordInput {
  kind: ConsentKind;
  source: ConsentSource;
  userId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  ip: string | null;
  userAgent: string | null;
  linkToken?: string | null;
}

/** Записывает согласие в журнал с текущей редакцией документа. */
export async function recordConsent(input: RecordInput) {
  const doc = await getCurrentDocument(input.kind);
  const [row] = await db
    .insert(s.consent)
    .values({
      kind: input.kind,
      source: input.source,
      documentId: doc.id,
      userId: input.userId ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email?.toLowerCase() ?? null,
      ip: input.ip,
      userAgent: input.userAgent,
      linkToken: input.linkToken ?? null,
      linkedAt: input.userId ? new Date() : null,
    })
    .returning();
  return row;
}

/** Есть ли у токена свежая неиспользованная отметка согласия на обработку ПДн. */
export async function findPendingConsent(token: string) {
  const since = new Date(Date.now() - CONSENT_TTL_MIN * 60_000);
  return db.query.consent.findFirst({
    where: and(
      eq(s.consent.linkToken, token),
      eq(s.consent.kind, "PERSONAL_DATA"),
      isNull(s.consent.userId),
      gt(s.consent.createdAt, since),
    ),
  });
}

/**
 * Привязывает отметки, сделанные до регистрации, к созданному аккаунту.
 * Привязываем только отметки без почты (Google) или с той же почтой, что у аккаунта.
 */
export async function linkPendingConsents(token: string, userId: string, email: string) {
  const since = new Date(Date.now() - CONSENT_TTL_MIN * 60_000);
  const rows = await db
    .update(s.consent)
    .set({ userId, linkedAt: new Date() })
    .where(
      and(
        eq(s.consent.linkToken, token),
        isNull(s.consent.userId),
        gt(s.consent.createdAt, since),
        or(isNull(s.consent.email), eq(sql`lower(${s.consent.email})`, email.toLowerCase())),
      ),
    )
    .returning();
  return rows;
}

/** Действующее (не отозванное) согласие пользователя данного вида. */
export async function getActiveConsent(userId: string, kind: ConsentKind) {
  return db.query.consent.findFirst({
    where: and(eq(s.consent.userId, userId), eq(s.consent.kind, kind), isNull(s.consent.revokedAt)),
    orderBy: desc(s.consent.createdAt),
    with: { document: { columns: { version: true, title: true } } },
  });
}

/** Отзыв: отмечаем все действующие согласия этого вида, строки не удаляем. */
export async function revokeConsent(userId: string, kind: ConsentKind, ip: string | null) {
  await db
    .update(s.consent)
    .set({ revokedAt: new Date(), revokeIp: ip })
    .where(and(eq(s.consent.userId, userId), eq(s.consent.kind, kind), isNull(s.consent.revokedAt)));
}
