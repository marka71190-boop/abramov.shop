import "server-only";
import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db";

export interface ConsentFilter {
  q?: string;
  kind?: string;
  status?: string;
  from?: string;
  to?: string;
}

/** Общий фильтр для таблицы журнала согласий и выгрузки в Excel. */
export function consentWhere(f: ConsentFilter) {
  const conds: SQL[] = [];
  const term = f.q?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, "")}%`;
    const digits = term.replace(/\D/g, "");
    conds.push(
      or(
        ilike(s.consent.email, like),
        ilike(s.consent.name, like),
        ilike(s.consent.ip, like),
        ...(digits.length >= 3 ? [ilike(s.consent.phone, `%${digits.slice(-10)}%`)] : []),
      )!,
    );
  }
  if (f.kind === "PERSONAL_DATA" || f.kind === "MARKETING") conds.push(eq(s.consent.kind, f.kind));
  if (f.status === "active") conds.push(isNull(s.consent.revokedAt));
  if (f.status === "revoked") conds.push(isNotNull(s.consent.revokedAt));
  if (f.status === "unlinked") conds.push(isNull(s.consent.userId));
  if (f.from) conds.push(gte(s.consent.createdAt, new Date(`${f.from}T00:00:00+03:00`)));
  if (f.to) conds.push(lte(s.consent.createdAt, new Date(`${f.to}T23:59:59.999+03:00`)));
  return conds.length ? and(...conds) : undefined;
}

export function consentRows(where: SQL | undefined, limit?: number, offset = 0) {
  const q = db
    .select({
      id: s.consent.id,
      createdAt: s.consent.createdAt,
      kind: s.consent.kind,
      source: s.consent.source,
      name: s.consent.name,
      phone: s.consent.phone,
      email: s.consent.email,
      ip: s.consent.ip,
      userAgent: s.consent.userAgent,
      userId: s.consent.userId,
      userEmail: s.user.email,
      revokedAt: s.consent.revokedAt,
      docVersion: s.consentDocument.version,
      docHash: s.consentDocument.sha256,
    })
    .from(s.consent)
    .innerJoin(s.consentDocument, eq(s.consent.documentId, s.consentDocument.id))
    .leftJoin(s.user, eq(s.consent.userId, s.user.id))
    .where(where)
    .orderBy(desc(s.consent.createdAt));
  return limit ? q.limit(limit).offset(offset) : q;
}

export const CONSENT_KIND_LABEL = { PERSONAL_DATA: "Обработка ПДн", MARKETING: "Рассылки" } as const;
export const CONSENT_SOURCE_LABEL = {
  REGISTRATION: "Регистрация",
  GOOGLE: "Вход через Google",
  CHECKOUT: "Оформление заказа",
  ACCOUNT: "Личный кабинет",
  RECONSENT: "Повторное согласие",
} as const;
