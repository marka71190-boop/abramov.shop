/**
 * Электронный паспорт кия.
 *
 *   • Выпуск: менеджер в админке — из заказа (кий на заказ или кий из каталога) или вручную (продажа в клубе, старые кии).
 *     Номер AB-26-0001 гравируется на кие; QR (наклейка) ведёт на abramov.shop/pasport/<code>.
 *   • Страница паспорта открыта всем: модель, мастер, дата, гарантия, история. Владелец не показывается.
 *   • Владелец: из заказа — сразу покупатель; иначе покупатель привязывает кий кодом с бумажной карточки.
 *   • Продал кий — «Передать новому владельцу»: ссылка на 7 дней, новый хозяин открывает её и принимает кий.
 *   • Мастерская и менеджер добавляют записи в историю (обслуживание, замена наклейки…).
 */
import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";

export class PassportError extends Error {}
export type Passport = typeof s.cuePassport.$inferSelect;
export type PassportEvent = typeof s.cuePassportEvent.$inferSelect;

const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789"; // без похожих символов
const CLAIM_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode(len: number, alphabet: string) {
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[b[i] % alphabet.length];
  return out;
}

export const passportUrl = (code: string) => `${SITE.url}/pasport/${code}`;

/** Гарантия до… */
export function warrantyUntil(p: Pick<Passport, "madeAt" | "warrantyMonths">) {
  const d = new Date(p.madeAt);
  d.setMonth(d.getMonth() + p.warrantyMonths);
  return d;
}

export interface NewPassport {
  model: string;
  spec?: string | null;
  master?: string | null;
  madeAt?: Date;
  warrantyMonths?: number;
  photo?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  ownerId?: string | null;
}

/** Выпустить паспорт */
export async function createPassport(input: NewPassport, createdById: string) {
  const model = input.model.trim().slice(0, 160);
  if (!model) throw new PassportError("Укажите модель кия");
  if (input.orderItemId) {
    const dup = await db.query.cuePassport.findFirst({ where: and(eq(s.cuePassport.orderItemId, input.orderItemId), eq(s.cuePassport.status, "ACTIVE")) });
    if (dup) throw new PassportError(`Для этой позиции заказа паспорт уже есть: ${dup.serial}`);
  }
  const madeAt = input.madeAt ?? new Date();
  const year = String(madeAt.getFullYear()).slice(-2);
  const [{ n }] = (await db.execute<{ n: string }>(sql`select nextval('cue_passport_seq')::text as n`)).rows;
  const serial = `AB-${year}-${n.padStart(4, "0")}`;
  const [p] = await db
    .insert(s.cuePassport)
    .values({
      code: randomCode(12, ALPHA),
      serial,
      claimCode: randomCode(8, CLAIM_ALPHA),
      model,
      spec: input.spec?.trim().slice(0, 2000) || null,
      master: input.master?.trim().slice(0, 80) || null,
      madeAt,
      warrantyMonths: Math.max(0, Math.min(120, Math.trunc(input.warrantyMonths ?? 12))),
      photo: input.photo || null,
      orderId: input.orderId ?? null,
      orderItemId: input.orderItemId ?? null,
      ownerId: input.ownerId ?? null,
      createdById,
    })
    .returning();
  const events: { kind: string; text: string }[] = [{ kind: "MADE", text: input.master?.trim() ? `Кий изготовлен, мастер — ${input.master.trim()}` : "Кий изготовлен" }];
  if (input.ownerId || input.orderId) events.push({ kind: "SOLD", text: "Продан в Abramov Shop" });
  await db.insert(s.cuePassportEvent).values(events.map((e) => ({ ...e, passportId: p.id })));
  if (p.ownerId) void notifyOwner(p.ownerId, p, "Паспорт вашего кия готов");
  return p;
}

async function notifyOwner(userId: string, p: Passport, title: string) {
  const url = `/pasport/${p.code}`;
  await import("@/lib/push").then((m) => m.pushToUser(userId, { title, body: `${p.model} · № ${p.serial}`, url, tag: `passport-${p.id.slice(0, 8)}` })).catch(() => 0);
  await import("@/lib/telegram")
    .then((t) => t.notifyUser(userId, `🎱 ${t.esc(title)}: <b>${t.esc(p.model)}</b>, № ${p.serial}`, { text: "Открыть паспорт", url: passportUrl(p.code) }))
    .catch(() => false);
}

export async function passportByCode(code: string) {
  if (!/^[a-z0-9]{8,20}$/.test(code)) return null;
  return (await db.query.cuePassport.findFirst({ where: eq(s.cuePassport.code, code) })) ?? null;
}

export async function passportEvents(passportId: string) {
  return db.query.cuePassportEvent.findMany({ where: eq(s.cuePassportEvent.passportId, passportId), orderBy: desc(s.cuePassportEvent.createdAt) });
}

/** Кто-то открыл паспорт (не владелец) — счётчик проверок */
export async function countScan(id: string) {
  await db.update(s.cuePassport).set({ scans: sql`${s.cuePassport.scans} + 1` }).where(eq(s.cuePassport.id, id));
}

export async function passportsOfUser(userId: string) {
  return db.query.cuePassport.findMany({ where: and(eq(s.cuePassport.ownerId, userId), eq(s.cuePassport.status, "ACTIVE")), orderBy: desc(s.cuePassport.madeAt) });
}

// Подбор кода с карточки: не больше 5 ошибок в час на паспорт
const g = globalThis as unknown as { __asClaim?: Map<string, number[]> };
const fails: Map<string, number[]> = (g.__asClaim ??= new Map());

/** Привязать кий к себе кодом с бумажной карточки (у кия ещё нет владельца) */
export async function claimPassport(code: string, claimCode: string, userId: string) {
  const p = await passportByCode(code);
  if (!p || p.status !== "ACTIVE") throw new PassportError("Паспорт не найден");
  if (p.ownerId === userId) return p;
  if (p.ownerId) throw new PassportError("У этого кия уже есть владелец. Если вы купили его с рук — попросите прежнего владельца передать кий через паспорт");
  const now = Date.now();
  const recent = (fails.get(p.id) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 5) throw new PassportError("Слишком много попыток — попробуйте через час");
  const want = Buffer.from(p.claimCode);
  const got = Buffer.from(claimCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    fails.set(p.id, [...recent, now]);
    throw new PassportError("Код не подходит. Он напечатан на карточке паспорта — 8 букв и цифр");
  }
  const r = await db.update(s.cuePassport).set({ ownerId: userId, updatedAt: new Date() }).where(and(eq(s.cuePassport.id, p.id), sql`${s.cuePassport.ownerId} is null`)).returning();
  if (!r.length) throw new PassportError("У этого кия уже есть владелец");
  await db.insert(s.cuePassportEvent).values({ passportId: p.id, kind: "OWNER", text: "Владелец зарегистрировал кий" });
  return r[0];
}

/** Владелец передаёт кий: ссылка на 7 дней */
export async function startTransfer(passportId: string, userId: string) {
  const token = randomBytes(16).toString("base64url");
  const r = await db
    .update(s.cuePassport)
    .set({ transferToken: token, transferUntil: new Date(Date.now() + 7 * 86400_000), updatedAt: new Date() })
    .where(and(eq(s.cuePassport.id, passportId), eq(s.cuePassport.ownerId, userId), eq(s.cuePassport.status, "ACTIVE")))
    .returning();
  if (!r.length) throw new PassportError("Передать кий может только его владелец");
  return `${passportUrl(r[0].code)}?t=${token}`;
}

export async function cancelTransfer(passportId: string, userId: string) {
  await db
    .update(s.cuePassport)
    .set({ transferToken: null, transferUntil: null })
    .where(and(eq(s.cuePassport.id, passportId), eq(s.cuePassport.ownerId, userId)));
}

export const transferValid = (p: Passport, token: string | null | undefined) =>
  !!token && !!p.transferToken && !!p.transferUntil && p.transferUntil > new Date() && token.length === p.transferToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(p.transferToken));

/** Новый владелец принимает кий по ссылке */
export async function acceptTransfer(code: string, token: string, userId: string) {
  const p = await passportByCode(code);
  if (!p || p.status !== "ACTIVE") throw new PassportError("Паспорт не найден");
  if (!transferValid(p, token)) throw new PassportError("Ссылка передачи устарела — попросите прежнего владельца прислать новую");
  if (p.ownerId === userId) throw new PassportError("Это уже ваш кий");
  const prev = p.ownerId;
  const r = await db
    .update(s.cuePassport)
    .set({ ownerId: userId, transferToken: null, transferUntil: null, updatedAt: new Date() })
    .where(and(eq(s.cuePassport.id, p.id), eq(s.cuePassport.transferToken, token)))
    .returning();
  if (!r.length) throw new PassportError("Кий уже передан");
  await db.insert(s.cuePassportEvent).values({ passportId: p.id, kind: "OWNER", text: "Кий сменил владельца" });
  if (prev) void notifyOwner(prev, r[0], "Кий передан новому владельцу");
  return r[0];
}

// ---------- Админка

export async function listPassports(q: string, limit = 100) {
  const t = q.trim().slice(0, 60);
  return db.query.cuePassport.findMany({
    where: t ? or(ilike(s.cuePassport.serial, `%${t}%`), ilike(s.cuePassport.model, `%${t}%`)) : undefined,
    orderBy: desc(s.cuePassport.createdAt),
    limit,
  });
}

export async function addPassportEvent(passportId: string, kind: "SERVICE" | "NOTE", text: string, serviceNumber?: string | null) {
  const t = text.trim().slice(0, 300);
  if (!t) throw new PassportError("Напишите, что сделали");
  let serviceRequestId: string | null = null;
  if (serviceNumber?.trim()) {
    const sr = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.number, serviceNumber.trim().toUpperCase()), columns: { id: true } });
    if (!sr) throw new PassportError(`Заявка мастерской ${serviceNumber} не найдена`);
    serviceRequestId = sr.id;
  }
  await db.insert(s.cuePassportEvent).values({ passportId, kind, text: t, serviceRequestId });
  await db.update(s.cuePassport).set({ updatedAt: new Date() }).where(eq(s.cuePassport.id, passportId));
}

export async function updatePassport(id: string, patch: Partial<Pick<Passport, "model" | "spec" | "master" | "madeAt" | "warrantyMonths" | "photo" | "status">>) {
  await db.update(s.cuePassport).set({ ...patch, updatedAt: new Date() }).where(eq(s.cuePassport.id, id));
}

/** Отвязать владельца (например, кий вернули) — новый привяжет кодом с карточки */
export async function detachOwner(id: string) {
  await db.update(s.cuePassport).set({ ownerId: null, transferToken: null, transferUntil: null, claimCode: randomCode(8, CLAIM_ALPHA), updatedAt: new Date() }).where(eq(s.cuePassport.id, id));
  await db.insert(s.cuePassportEvent).values({ passportId: id, kind: "NOTE", text: "Владелец отвязан, выдан новый код карточки" });
}

/** Паспорта для позиций заказа — кнопки «Паспорт» на странице заказа */
export async function passportsOfOrder(orderId: string) {
  return db.query.cuePassport.findMany({ where: eq(s.cuePassport.orderId, orderId) });
}

export const EVENT_ICON: Record<string, string> = { MADE: "🛠", SOLD: "🛍", OWNER: "🤝", SERVICE: "🔧", NOTE: "📝" };
