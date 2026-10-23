import { and, isNull, lte, ne, or, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export type Visibility = "DRAFT" | "HIDDEN" | "PUBLISHED";

interface Publishable {
  visibility: Visibility;
  publishAt: Date | null;
  previewToken: string;
}

/** Открыта ли запись для всех: опубликована и время публикации (если задано) наступило. */
export function isPublic(e: Pick<Publishable, "visibility" | "publishAt">, now = new Date()) {
  return e.visibility === "PUBLISHED" && (!e.publishAt || e.publishAt <= now);
}

/** Может ли посетитель увидеть запись: открыта, или он админ, или пришёл по ссылке предпросмотра. */
export function canView(e: Publishable, opts: { admin: boolean; preview?: string | null }) {
  return isPublic(e) || opts.admin || (!!opts.preview && opts.preview === e.previewToken);
}

/** Условие для запросов списка: только открытые записи. */
export function publicWhere(t: { visibility: PgColumn; publishAt: PgColumn }): SQL {
  return and(eq(t.visibility, "PUBLISHED"), or(isNull(t.publishAt), lte(t.publishAt, new Date())))!;
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  DRAFT: "Черновик",
  HIDDEN: "Скрыто",
  PUBLISHED: "Опубликовано",
};

/** Товар розницы: открыт и не только для оптового каталога */
export function isRetail(p: Pick<Publishable, "visibility" | "publishAt"> & { channel: string }, now = new Date()) {
  return isPublic(p, now) && p.channel !== "WHOLESALE";
}

/** Условие для розничных списков товаров: открыт и не «только опт» */
export function retailWhere(t: { visibility: PgColumn; publishAt: PgColumn; channel: PgColumn }): SQL {
  return and(publicWhere(t), ne(t.channel, "WHOLESALE"))!;
}
