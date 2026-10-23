"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { getActiveConsent } from "@/lib/consent";
import { normalizePhone } from "@/lib/format";
import { createRateLimiter } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { getActiveBan, getViewer } from "@/lib/viewer";
import { lookupInn, ORG_KIND, validInn, type InnInfo } from "@/lib/wholesale";

const limit = createRateLimiter({ limit: 5, windowMs: 3600_000 });
const lookupLimit = createRateLimiter({ limit: 30, windowMs: 3600_000 });

const In = z.object({
  inn: z.string().trim().max(20),
  name: z.string().trim().min(3, "Название организации").max(200),
  kpp: z.string().trim().max(20).optional(),
  ogrn: z.string().trim().max(20).optional(),
  legalAddress: z.string().trim().min(5, "Юридический адрес").max(400),
  kind: z.enum(["CLUB", "SHOP", "COACH", "OTHER"]),
  city: z.string().trim().min(2, "Город").max(80),
  tables: z.string().trim().max(6).optional(),
  website: z.string().trim().max(200).optional(),
  contactName: z.string().trim().min(2, "Контактное лицо").max(120),
  contactPhone: z.string().trim().max(40),
  contactEmail: z.email("Проверьте почту").max(200),
  comment: z.string().trim().max(2000).optional(),
});

export async function innLookupAction(inn: string): Promise<{ info?: InnInfo; error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Войдите в аккаунт" };
  if (!lookupLimit(me.id)) return { error: "Слишком много запросов — заполните вручную" };
  if (!validInn(inn)) return { error: "ИНН не прошёл проверку — 10 цифр для организации, 12 для ИП" };
  const info = await lookupInn(inn);
  if (!info) return { error: "Не нашли реквизиты — заполните вручную" };
  if (!info.active) return { error: "По данным ЕГРЮЛ организация не действует" };
  return { info };
}

export async function submitOrgAction(_: unknown, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Войдите в аккаунт" };
  if (getActiveBan(me)) return { error: "Аккаунт заблокирован" };
  const settings = await getSettings();
  if (!settings.b2b.enabled) return { error: "Приём заявок сейчас закрыт" };
  if (!(await getActiveConsent(me.id, "PERSONAL_DATA"))) return { error: "Нужно согласие на обработку персональных данных — откройте личный кабинет" };
  if (!limit(me.id)) return { error: "Слишком много попыток — попробуйте через час" };
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const inn = d.inn.replace(/\D/g, "");
  if (!validInn(inn)) return { error: "ИНН не прошёл проверку — 10 цифр для организации, 12 для ИП" };
  const phone = normalizePhone(d.contactPhone);
  if (!phone) return { error: "Проверьте телефон: нужен российский номер" };
  const tables = d.tables ? Math.max(0, Math.min(9999, Math.trunc(Number(d.tables)) || 0)) : null;

  const values = {
    inn,
    name: d.name,
    kpp: d.kpp?.replace(/\D/g, "") || null,
    ogrn: d.ogrn?.replace(/\D/g, "") || null,
    legalAddress: d.legalAddress,
    kind: d.kind,
    city: d.city,
    tables,
    website: d.website || null,
    contactName: d.contactName,
    contactPhone: phone,
    contactEmail: d.contactEmail,
    comment: d.comment || null,
    status: "PENDING" as const,
    rejectReason: null,
    updatedAt: new Date(),
  };

  const existing = await db.query.organization.findFirst({ where: eq(s.organization.inn, inn) });
  const current = me.organizationId ? await db.query.organization.findFirst({ where: eq(s.organization.id, me.organizationId) }) : null;
  let orgId: string;
  if (existing && existing.id !== current?.id) {
    // ИНН уже есть: заявку подавал другой сотрудник — новых людей добавляет магазин, чтобы чужие не получили доступ
    return { error: "Эта организация уже подала заявку. Попросите коллегу, который её подавал, написать нам — добавим вас к организации" };
  }
  if (current && current.status === "APPROVED") return { error: "Организация уже одобрена" };
  if (current && current.status === "BLOCKED") return { error: "Доступ организации закрыт — напишите нам" };
  if (current) {
    await db.update(s.organization).set(values).where(eq(s.organization.id, current.id));
    orgId = current.id;
  } else {
    const [row] = await db.insert(s.organization).values({ ...values, createdById: me.id }).returning({ id: s.organization.id });
    orgId = row.id;
    await db.update(s.user).set({ organizationId: orgId }).where(eq(s.user.id, me.id));
  }
  await auditSystem(me.id, "org.apply", "organization", orgId, { kind: d.kind });
  // Админам — без названия и ИНН (у ИП это персональные данные): только тип и город
  const { notifyAdmins } = await import("@/lib/telegram");
  void notifyAdmins(`🏢 <b>Новая заявка на оптовые цены</b>\n${ORG_KIND[d.kind]}, ${d.city.replace(/[<>&]/g, "")}${tables ? `, столов: ${tables}` : ""}`, {
    text: "Проверить заявку",
    url: `${SITE.url}/admin/orgs/${orgId}`,
  }).catch(() => {});
  revalidatePath("/opt");
  return { ok: true };
}
