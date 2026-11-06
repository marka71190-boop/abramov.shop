/**
 * Рабочие телефоны кассы — служебные аккаунты, которые владелец создаёт сам.
 *
 * - Вход по короткому логину (kassa1) и паролю на /kassa/login, без почты и без согласия на ПДн:
 *   персональных данных у такого аккаунта нет, это «устройство», а не человек.
 * - Только касса своего клуба: роль CASHIER, один клуб в clubIds. Заказы, кабинет, бонусы — нельзя.
 * - Кто на смене, касса спрашивает при открытии смены (общий телефон — разные люди).
 * - Отключить — сразу выходит на телефоне и пароль перестаёт подходить.
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";
import { getClub } from "@/lib/clubs";
import { kassaEmail, kassaLogin } from "@/lib/site";

export class DeviceError extends Error {}

/** Пароль, который легко продиктовать и набрать: без похожих символов 0/O, 1/l */
export function generatePassword(len = 10) {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const LOGIN_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

export function checkLogin(raw: string) {
  const login = raw.trim().toLowerCase();
  if (!LOGIN_RE.test(login)) throw new DeviceError("Логин — 3–30 латинских букв, цифр или дефисов, например kassa1");
  return login;
}

async function activeClub(clubId: string) {
  const club = await getClub(clubId);
  if (!club || !club.isActive) throw new DeviceError("Выберите клуб");
  return club;
}

export async function listDevices() {
  const rows = await db.query.user.findMany({ where: eq(s.user.isDevice, true), orderBy: desc(s.user.createdAt) });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [seen, shifts] = await Promise.all([
    db.select({ userId: s.session.userId, at: max(s.session.updatedAt) }).from(s.session).where(inArray(s.session.userId, ids)).groupBy(s.session.userId),
    db.query.posShift.findMany({ where: and(inArray(s.posShift.sellerId, ids), eq(s.posShift.status, "OPEN")) }),
  ]);
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    login: kassaLogin(u.email),
    clubId: u.clubIds[0] ?? null,
    active: !u.bannedAt,
    lastSeen: seen.find((x) => x.userId === u.id)?.at ?? null,
    openShift: shifts.find((x) => x.sellerId === u.id) ?? null,
    createdAt: u.createdAt,
  }));
}

export async function createDevice(p: { name: string; clubId: string; login: string; password?: string }) {
  const login = checkLogin(p.login);
  const club = await activeClub(p.clubId);
  const email = kassaEmail(login);
  if (await db.query.user.findFirst({ where: eq(s.user.email, email), columns: { id: true } })) throw new DeviceError("Такой логин уже занят — придумайте другой");
  const password = p.password?.trim() || generatePassword();
  if (password.length < 8) throw new DeviceError("Пароль — не короче 8 символов");
  const name = p.name.trim().slice(0, 80) || `Касса · ${clubTitle(club)}`;
  const id = randomUUID();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(s.user).values({ id, name, email, emailVerified: true, role: "CASHIER", clubIds: [club.id], isDevice: true });
    await tx.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  });
  return { id, login, password, name };
}

async function device(id: string) {
  const u = await db.query.user.findFirst({ where: and(eq(s.user.id, id), eq(s.user.isDevice, true)) });
  if (!u) throw new DeviceError("Телефон кассы не найден");
  return u;
}

/** Новый пароль: телефон сразу выходит из кассы, войти можно только с новым паролем */
export async function resetDevicePassword(id: string) {
  const u = await device(id);
  const password = generatePassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const r = await tx
      .update(s.account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(s.account.userId, u.id), eq(s.account.providerId, "credential")))
      .returning({ id: s.account.id });
    if (!r.length) await tx.insert(s.account).values({ id: randomUUID(), accountId: u.id, providerId: "credential", userId: u.id, password: hash });
    await tx.delete(s.session).where(eq(s.session.userId, u.id));
    await tx.update(s.user).set({ bannedAt: null, bannedUntil: null, banReason: null }).where(eq(s.user.id, u.id));
  });
  return { login: kassaLogin(u.email), password };
}

/** Отключить: выйти на телефоне и сменить пароль на случайный (никому не известный) */
export async function disableDevice(id: string, byId: string) {
  const u = await device(id);
  const hash = await hashPassword(generatePassword(24));
  await db.transaction(async (tx) => {
    await tx.update(s.account).set({ password: hash }).where(eq(s.account.userId, u.id));
    await tx.delete(s.session).where(eq(s.session.userId, u.id));
    await tx.update(s.user).set({ bannedAt: new Date(), bannedUntil: null, banReason: "Телефон кассы отключён", bannedById: byId }).where(eq(s.user.id, u.id));
  });
}

export async function updateDevice(id: string, p: { name: string; clubId: string }) {
  const u = await device(id);
  const club = await activeClub(p.clubId);
  if (club.id !== u.clubIds[0]) {
    const open = await db.query.posShift.findFirst({ where: and(eq(s.posShift.sellerId, u.id), eq(s.posShift.status, "OPEN")), columns: { id: true } });
    if (open) throw new DeviceError("На этом телефоне открыта смена — сначала закройте её, потом меняйте клуб");
  }
  const name = p.name.trim().slice(0, 80) || u.name;
  await db.update(s.user).set({ name, clubIds: [club.id] }).where(eq(s.user.id, u.id));
}
