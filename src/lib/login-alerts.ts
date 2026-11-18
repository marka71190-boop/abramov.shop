/**
 * Вход в аккаунт сотрудника с нового устройства.
 * Сотрудник (владелец, директор, менеджер, кассир, клуб, тренер, телефон кассы) вошёл с браузера, с которого раньше
 * не входил, — ему письмо «Это были вы?» с кнопкой «Это был не я», владельцу — сообщение в Telegram и на телефон.
 * «Это был не я» сразу завершает все сеансы аккаунта: тот, кто вошёл, вылетит.
 * Самый первый вход после включения проверки только запоминает устройство — без тревоги.
 */
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { STAFF_ROLES } from "@/lib/roles";
import { SITE } from "@/lib/site";

/** «Chrome · Windows», «Safari · iPhone» — понятная подпись устройства */
export function deviceLabel(ua: string | null | undefined) {
  const u = ua ?? "";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "неизвестная система";
  const br = /YaBrowser/.test(u) ? "Яндекс Браузер" : /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "браузер";
  return `${br} · ${os}`;
}

/** Отпечаток устройства: браузер и система без номеров версий — обновление браузера не считается новым устройством */
const deviceKey = (ua: string | null | undefined) => createHash("sha256").update((ua ?? "").replace(/[\d._]+/g, "").slice(0, 400)).digest("hex").slice(0, 32);

const isStaff = (u: { role: string; extraRoles: string[]; isDevice: boolean }) =>
  u.isDevice || STAFF_ROLES.some((r) => u.role === r || u.extraRoles.includes(r));

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Вызывается после создания сеанса (вход по паролю, коду, Face ID). Ошибки не мешают входу */
export async function onSessionCreated(session: { userId: string; ipAddress?: string | null; userAgent?: string | null }) {
  const u = await db.query.user.findFirst({ where: eq(s.user.id, session.userId) });
  if (!u || !isStaff(u)) return;
  const key = deviceKey(session.userAgent);
  const label = deviceLabel(session.userAgent);
  const known = await db.select({ key: s.loginDevice.key }).from(s.loginDevice).where(eq(s.loginDevice.userId, u.id));
  const isNew = !known.some((k) => k.key === key);
  await db
    .insert(s.loginDevice)
    .values({ userId: u.id, key, label, ip: session.ipAddress ?? null })
    .onConflictDoUpdate({ target: [s.loginDevice.userId, s.loginDevice.key], set: { lastAt: new Date(), ip: session.ipAddress ?? null } });
  // Первое устройство после включения проверки — просто запоминаем
  if (!isNew || known.length === 0) return;

  const when = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date());
  const where = `${label}${session.ipAddress ? `, IP ${session.ipAddress}` : ""}`;
  const token = randomBytes(24).toString("hex");
  await db.insert(s.verification).values({ id: randomUUID(), identifier: `signout-all:${token}`, value: u.id, expiresAt: new Date(Date.now() + 7 * 86400_000) });

  const { sendMail } = await import("@/lib/mail");
  void sendMail(
    u.email,
    "Вход в ваш аккаунт с нового устройства — Abramov Shop",
    "Это были вы?",
    `${when} в ваш аккаунт вошли с нового устройства:<br><br><b>${esc(where)}</b><br><br>Если это вы — ничего делать не нужно.<br>Если нет — нажмите кнопку: все входы в аккаунт сразу завершатся. Затем смените пароль через «Забыли пароль?».`,
    { text: "Это был не я — выйти везде", url: `${SITE.url}/security/signout/${token}` },
  ).catch((e) => console.error("[login-alert] письмо:", e instanceof Error ? e.message : e));

  // Владельцу — о входах сотрудников (о своём входе он узнает из письма)
  if (u.role !== "OWNER") {
    const tg = await import("@/lib/telegram");
    const owners = await db.select({ chatId: s.user.telegramChatId }).from(s.user).where(and(eq(s.user.role, "OWNER"), sql`${s.user.telegramChatId} is not null`));
    const text = `🔐 Вход с нового устройства: <b>${tg.esc(u.name)}</b>${u.isDevice ? " (телефон кассы)" : ""}\n${tg.esc(where)}`;
    for (const o of owners) if (o.chatId) await tg.send(o.chatId, text).catch(() => {});
    void import("@/lib/push")
      .then(async (p) => {
        const ids = (await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.role, "OWNER"))).map((x) => x.id);
        await p.pushToUsers(ids, { title: "Вход с нового устройства", body: `${u.name}: ${where}`, url: "/admin/customers" });
      })
      .catch(() => {});
  }
}

/** Ссылка «Это был не я»: кому принадлежит */
export async function signoutTarget(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const v = await db.query.verification.findFirst({ where: eq(s.verification.identifier, `signout-all:${token}`) });
  if (!v || v.expiresAt < new Date()) return null;
  return db.query.user.findFirst({ where: eq(s.user.id, v.value), columns: { id: true, name: true } });
}

/** Завершить все сеансы аккаунта и забыть его устройства; владельцу — сообщение */
export async function signoutEverywhere(token: string) {
  const u = await signoutTarget(token);
  if (!u) return false;
  await db.delete(s.session).where(eq(s.session.userId, u.id));
  await db.delete(s.loginDevice).where(eq(s.loginDevice.userId, u.id));
  // Ссылки «это был не я» этого человека больше не нужны
  await db.delete(s.verification).where(and(like(s.verification.identifier, "signout-all:%"), eq(s.verification.value, u.id)));
  const { auditSystem } = await import("@/lib/audit");
  await auditSystem(u.id, "security.signout_all", "user", u.id, {}).catch(() => {});
  void import("@/lib/telegram")
    .then((t) => t.notifyAdmins(`🚨 ${t.esc(u.name)} нажал «Это был не я»: все входы в его аккаунт завершены. Проверьте журнал действий.`))
    .catch(() => {});
  return true;
}
