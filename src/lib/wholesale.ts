/**
 * Опт для клубов и организаций.
 *
 * Как работает:
 *   • организация подаёт заявку на /opt (ИНН, реквизиты, контакт) — заявка ждёт проверки;
 *   • владелец или менеджер одобряет её в админке → сотрудники организации видят оптовый каталог;
 *   • оптовые позиции лежат в обычной корзине с ключом «w:<вариант>», цену всегда считает сервер;
 *   • на оптовые позиции не действуют промокоды, комплекты и бонусы;
 *   • оплатить можно картой или по счёту (печатный счёт с QR-кодом), оплату по счёту отмечают в админке.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema as s } from "@/db";
import type { UserRow } from "@/lib/viewer";

export type Org = typeof s.organization.$inferSelect;
export type OrgStatus = Org["status"];

export const ORG_KIND: Record<string, string> = { CLUB: "Бильярдный клуб", SHOP: "Магазин", COACH: "Тренер, школа", OTHER: "Другое" };
export const ORG_STATUS: Record<OrgStatus, { text: string; tone: "dim" | "gold" | "ok" | "bad" }> = {
  PENDING: { text: "На проверке", tone: "gold" },
  APPROVED: { text: "Одобрена", tone: "ok" },
  REJECTED: { text: "Отклонена", tone: "bad" },
  BLOCKED: { text: "Доступ закрыт", tone: "bad" },
};

export const WHOLESALE_PREFIX = "w:";
export const isWholesaleKey = (k: string) => k.startsWith(WHOLESALE_PREFIX);

/** Организация покупателя (любой статус) */
export const orgOf = cache(async (userId: string | null | undefined): Promise<Org | null> => {
  if (!userId) return null;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, userId), columns: { organizationId: true } });
  if (!u?.organizationId) return null;
  return (await db.query.organization.findFirst({ where: eq(s.organization.id, u.organizationId) })) ?? null;
});

/** Одобренная организация покупателя — только ей доступны оптовые цены */
export async function approvedOrg(user: Pick<UserRow, "id" | "organizationId"> | null | undefined) {
  if (!user?.organizationId) return null;
  const org = await orgOf(user.id);
  return org?.status === "APPROVED" ? org : null;
}

/** Оптовая цена варианта: своя оптовая у товара, иначе цена варианта или товара */
export const wholesalePriceOf = (p: { price: number; wholesalePrice: number | null }, v: { price: number | null }) => p.wholesalePrice ?? v.price ?? p.price;

/** Проверка ИНН по контрольным цифрам: 10 цифр — организация, 12 — ИП */
export function validInn(raw: string) {
  const inn = raw.replace(/\D/g, "");
  const d = inn.split("").map(Number);
  const sum = (w: number[]) => (w.reduce((a, k, i) => a + k * d[i], 0) % 11) % 10;
  if (inn.length === 10) return sum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  if (inn.length === 12) return sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  return false;
}

export interface InnInfo {
  name: string;
  kpp: string | null;
  ogrn: string | null;
  address: string;
  active: boolean;
}

export const innLookupEnabled = () => !!process.env.DADATA_API_KEY;

/** Реквизиты по ИНН из ЕГРЮЛ через DaData (если задан ключ DADATA_API_KEY). Персональные данные не передаём — только ИНН */
export async function lookupInn(inn: string): Promise<InnInfo | null> {
  if (!innLookupEnabled() || !validInn(inn)) return null;
  try {
    const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${process.env.DADATA_API_KEY}` },
      body: JSON.stringify({ query: inn.replace(/\D/g, ""), count: 1 }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      suggestions?: { value: string; data: { kpp?: string; ogrn?: string; name?: { short_with_opf?: string; full_with_opf?: string }; address?: { value?: string }; state?: { status?: string } } }[];
    };
    const x = data.suggestions?.[0];
    if (!x) return null;
    return {
      name: x.data.name?.short_with_opf || x.value,
      kpp: x.data.kpp ?? null,
      ogrn: x.data.ogrn ?? null,
      address: x.data.address?.value ?? "",
      active: !x.data.state?.status || x.data.state.status === "ACTIVE",
    };
  } catch (e) {
    console.error("[dadata]", e instanceof Error ? e.message : e);
    return null;
  }
}

export interface WholesaleItem {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  image: string | null;
  categoryId: string | null;
  min: number;
  /** Розничная цена — для сравнения (если товар есть и в рознице) */
  retail: number | null;
  variants: { id: string; name: string; price: number; stock: number }[];
}

/** Оптовый каталог: товары «только опт» и «розница и опт» */
export async function wholesaleCatalog() {
  const { and, asc, inArray } = await import("drizzle-orm");
  const { publicWhere, isPublic } = await import("@/lib/visibility");
  const [products, cats] = await Promise.all([
    db.query.product.findMany({
      where: and(publicWhere(s.product), inArray(s.product.channel, ["WHOLESALE", "BOTH"])),
      with: {
        category: true,
        variants: { where: eq(s.productVariant.isActive, true), orderBy: asc(s.productVariant.sortOrder) },
        images: { orderBy: asc(s.productImage.sortOrder), limit: 1 },
      },
      orderBy: [asc(s.product.sortOrder), asc(s.product.name)],
      limit: 1000,
    }),
    db.query.category.findMany({ orderBy: asc(s.category.sortOrder) }),
  ]);
  const items: WholesaleItem[] = products
    .filter((p) => !p.category || isPublic(p.category))
    .filter((p) => p.variants.length)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      image: p.images[0]?.url ?? null,
      categoryId: p.categoryId,
      min: Math.max(1, p.wholesaleMin),
      retail: p.channel === "BOTH" ? Math.min(...p.variants.map((v) => v.price ?? p.price)) : null,
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: wholesalePriceOf(p, v), stock: v.stock })),
    }));
  const used = new Set(items.map((i) => i.categoryId));
  return { items, categories: cats.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name })) };
}

/** Решение по заявке: письмо контактному лицу и всем сотрудникам организации */
export async function setOrgStatus(id: string, status: "APPROVED" | "REJECTED" | "BLOCKED", actorId: string, reason?: string | null) {
  const org = await db.query.organization.findFirst({ where: eq(s.organization.id, id) });
  if (!org) throw new Error("Организация не найдена");
  const [next] = await db
    .update(s.organization)
    .set({ status, rejectReason: status === "APPROVED" ? null : reason?.trim().slice(0, 500) || null, reviewedById: actorId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(s.organization.id, id))
    .returning();
  const { auditSystem } = await import("@/lib/audit");
  await auditSystem(actorId, `org.${status.toLowerCase()}`, "organization", id, reason ? { reason } : undefined);
  void mailOrgStatus(next).catch((e) => console.error("[opt] письмо:", e));
  return next;
}

async function mailOrgStatus(org: Org) {
  const { mailEnabled, sendMail, escHtml } = await import("@/lib/mail");
  const { SITE } = await import("@/lib/site");
  if (!mailEnabled()) return;
  const members = await db.query.user.findMany({ where: eq(s.user.organizationId, org.id), columns: { email: true } });
  const to = [...new Set([org.contactEmail, ...members.map((m) => m.email)])];
  const url = `${SITE.url}/opt`;
  const [subject, title, body, button] =
    org.status === "APPROVED"
      ? [
          "Оптовые цены открыты",
          "Добро пожаловать в опт!",
          `Заявка <b>${escHtml(org.name)}</b> одобрена. Оптовый каталог уже открыт — войдите на сайт под своим аккаунтом.<br><br>Оплатить заказ можно картой или по счёту: выберите способ при оформлении.`,
          { text: "Открыть оптовый каталог", url },
        ]
      : org.status === "REJECTED"
        ? [
            "Заявка на оптовые цены",
            "Заявку пока не одобрили",
            `Мы проверили заявку <b>${escHtml(org.name)}</b> и пока не можем открыть оптовые цены.${org.rejectReason ? `<br><br>Причина: ${escHtml(org.rejectReason)}` : ""}<br><br>Можно исправить данные и отправить заявку снова.`,
            { text: "Исправить заявку", url },
          ]
        : [
            "Доступ к оптовым ценам закрыт",
            "Доступ к оптовым ценам закрыт",
            `Доступ <b>${escHtml(org.name)}</b> к оптовому каталогу закрыт.${org.rejectReason ? `<br><br>${escHtml(org.rejectReason)}` : ""} Если это ошибка — ответьте на это письмо.`,
            undefined,
          ];
  for (const email of to) await sendMail(email, subject as string, title as string, body as string, button as { text: string; url: string } | undefined).catch(() => {});
}
