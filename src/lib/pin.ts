/**
 * PIN менеджера: 6 цифр, подтверждает в кассе то, что кассиру нельзя самому, —
 * скидку сверх лимита и возврат. Защита от подбора и махинаций:
 *   • задать или сменить PIN можно только с кодом из письма на почту владельца PIN;
 *   • в базе — только хеш (как у паролей);
 *   • 5 неверных вводов подряд — PIN блокируется, владельцу PIN уходит письмо;
 *   • каждое использование — письмо владельцу PIN: где, кто на смене, что подтвердил,
 *     и кнопка «Это был не я — заблокировать PIN».
 */
import "server-only";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, like } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { db, schema as s } from "@/db";
import { userHasAnyRole } from "@/lib/roles-sql";
import { SITE } from "@/lib/site";

export class PinError extends Error {}

const MAX_FAILS = 5;
const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Слишком простые PIN: одинаковые цифры, подряд по возрастанию или убыванию, повтор пары/тройки */
export function weakPin(pin: string) {
  const d = pin.split("").map(Number);
  if (new Set(d).size === 1) return true;
  if (d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10)) return true;
  if (d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10)) return true;
  if (pin.slice(0, 3) === pin.slice(3) || pin.slice(0, 2).repeat(3) === pin) return true;
  return false;
}

async function mail(to: string, subject: string, title: string, html: string, button?: { text: string; url: string }) {
  const { sendMail, mailEnabled } = await import("@/lib/mail");
  if (!mailEnabled()) {
    console.error("[pin] почта не настроена — письмо не отправлено:", subject);
    return false;
  }
  return sendMail(to, subject, title, html, button).catch((e) => {
    console.error("[pin] письмо:", e instanceof Error ? e.message : e);
    return false;
  });
}

/** Шаг 1: новый PIN — отправляем код подтверждения на почту */
export async function requestPinSet(user: { id: string; email: string; name: string }, pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new PinError("PIN — ровно 6 цифр");
  if (weakPin(pin)) throw new PinError("Слишком простой PIN — не используйте 111111, 123456, 121212 и похожие");
  const { mailEnabled } = await import("@/lib/mail");
  if (!mailEnabled()) throw new PinError("Почта сайта не настроена — код подтверждения отправить некуда");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const value = JSON.stringify({ pinHash: await hashPassword(pin), codeHash: sha(code), attempts: 0 });
  await db.delete(s.verification).where(eq(s.verification.identifier, `pin-set:${user.id}`));
  await db.insert(s.verification).values({ id: randomUUID(), identifier: `pin-set:${user.id}`, value, expiresAt: new Date(Date.now() + 15 * 60_000) });
  await mail(
    user.email,
    `Код подтверждения PIN: ${code} — Abramov Shop`,
    "Подтвердите PIN",
    `Вы задаёте PIN для кассы Abramov Shop. Код подтверждения:<br><br><b style="font-size:30px;letter-spacing:6px">${code}</b><br><br>Код действует 15 минут. Если это были не вы — никому не сообщайте код и смените пароль от аккаунта.`,
  );
}

/** Шаг 2: код из письма — PIN начинает действовать */
export async function confirmPinSet(userId: string, code: string) {
  const row = await db.query.verification.findFirst({ where: and(eq(s.verification.identifier, `pin-set:${userId}`), gt(s.verification.expiresAt, new Date())) });
  if (!row) throw new PinError("Код устарел — задайте PIN заново");
  const v = JSON.parse(row.value) as { pinHash: string; codeHash: string; attempts: number };
  if (v.attempts >= 5) {
    await db.delete(s.verification).where(eq(s.verification.id, row.id));
    throw new PinError("Слишком много неверных кодов — задайте PIN заново");
  }
  if (sha(code.trim()) !== v.codeHash) {
    await db.update(s.verification).set({ value: JSON.stringify({ ...v, attempts: v.attempts + 1 }) }).where(eq(s.verification.id, row.id));
    throw new PinError("Неверный код из письма");
  }
  await db.update(s.user).set({ pinHash: v.pinHash, pinSetAt: new Date(), pinFailed: 0, pinLockedAt: null }).where(eq(s.user.id, userId));
  await db.delete(s.verification).where(eq(s.verification.id, row.id));
}

/** Кто может подтвердить PIN в кассе: владелец и менеджеры с действующим PIN */
export async function pinApprovers() {
  const rows = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(and(userHasAnyRole(["OWNER", "MANAGER"]), isNotNull(s.user.pinHash), isNull(s.user.pinLockedAt), isNull(s.user.bannedAt), eq(s.user.isDevice, false)));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export interface PinContext {
  action: string; // «Скидка 20 % на чек K-…», «Возврат 1 500 ₽ по чеку K-…»
  kassa: string; // кто в кассе: имя сотрудника или «Касса · клуб»
  staffName?: string | null; // кто на смене (общий телефон)
  place?: string | null;
}

/** Проверить PIN. Ошибка — PinError с понятным текстом; успех — данные подтвердившего */
export async function verifyPin(approverId: string, pin: string, ctx: PinContext) {
  const u = await db.query.user.findFirst({ where: eq(s.user.id, String(approverId).slice(0, 64)) });
  const staff = u && !u.isDevice && !u.bannedAt && (u.role === "OWNER" || u.role === "MANAGER" || u.extraRoles.includes("MANAGER") || u.extraRoles.includes("OWNER"));
  if (!u || !staff || !u.pinHash) throw new PinError("Выберите менеджера, который подтверждает");
  if (u.pinLockedAt) throw new PinError(`PIN менеджера ${u.name} заблокирован — он может задать новый в админке`);
  const ok = /^\d{6}$/.test(pin) && (await verifyPassword({ hash: u.pinHash, password: pin }));
  if (!ok) {
    const fails = u.pinFailed + 1;
    const locked = fails >= MAX_FAILS;
    await db
      .update(s.user)
      .set({ pinFailed: fails, ...(locked ? { pinLockedAt: new Date() } : {}) })
      .where(eq(s.user.id, u.id));
    if (locked) {
      void mail(
        u.email,
        "PIN заблокирован — Abramov Shop",
        "PIN заблокирован",
        `Ваш PIN для кассы ввели неверно ${MAX_FAILS} раз подряд, и мы его заблокировали.<br><br>Где: ${esc(ctx.kassa)}${ctx.staffName ? ` (на смене: ${esc(ctx.staffName)})` : ""}${ctx.place ? `, ${esc(ctx.place)}` : ""}.<br>Пытались подтвердить: ${esc(ctx.action)}.<br><br>Если это были не вы — возможно, PIN пытаются подобрать. Задайте новый PIN в админке: «Касса» → «Мой PIN».`,
        { text: "Задать новый PIN", url: `${SITE.url}/admin/pos/pin` },
      );
      void import("@/lib/telegram")
        .then((t) => t.notifyAdmins(`🔐 PIN менеджера ${esc(u.name)} заблокирован: ${MAX_FAILS} неверных вводов. Касса: ${esc(ctx.kassa)}${ctx.staffName ? ` (${esc(ctx.staffName)})` : ""}.`))
        .catch(() => {});
      throw new PinError(`Неверный PIN. PIN менеджера ${u.name} заблокирован — ему ушло письмо`);
    }
    throw new PinError(`Неверный PIN — осталось попыток: ${MAX_FAILS - fails}`);
  }
  if (u.pinFailed) await db.update(s.user).set({ pinFailed: 0 }).where(eq(s.user.id, u.id));

  // Письмо владельцу PIN: что подтвердили и кнопка «это был не я»
  const token = randomBytes(24).toString("hex");
  await db.insert(s.verification).values({ id: randomUUID(), identifier: `pin-block:${token}`, value: u.id, expiresAt: new Date(Date.now() + 14 * 86400_000) });
  const when = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date());
  void mail(
    u.email,
    `Ваш PIN подтвердил: ${ctx.action}`,
    "PIN использован в кассе",
    `${when} вашим PIN подтвердили в кассе:<br><br><b>${esc(ctx.action)}</b><br><br>Касса: ${esc(ctx.kassa)}${ctx.staffName ? `<br>На смене: ${esc(ctx.staffName)}` : ""}${ctx.place ? `<br>Где: ${esc(ctx.place)}` : ""}<br><br>Если это были не вы — нажмите кнопку: PIN сразу перестанет работать, а владельцу магазина придёт сообщение.`,
    { text: "Это был не я — заблокировать PIN", url: `${SITE.url}/pin/block/${token}` },
  );
  return { id: u.id, name: u.name };
}

/** Ссылка из письма «это был не я»: заблокировать PIN */
export async function pinBlockTarget(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const row = await db.query.verification.findFirst({ where: and(eq(s.verification.identifier, `pin-block:${token}`), gt(s.verification.expiresAt, new Date())) });
  if (!row) return null;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, row.value), columns: { id: true, name: true, pinLockedAt: true } });
  return u ? { ...u, rowId: row.id } : null;
}

export async function blockPinByToken(token: string) {
  const t = await pinBlockTarget(token);
  if (!t) return null;
  await db.update(s.user).set({ pinLockedAt: new Date() }).where(eq(s.user.id, t.id));
  // Остальные ссылки этого человека тоже больше не нужны
  await db.delete(s.verification).where(and(like(s.verification.identifier, "pin-block:%"), eq(s.verification.value, t.id)));
  void import("@/lib/telegram")
    .then((m) => m.notifyAdmins(`🚨 ${esc(t.name)} сообщил, что его PIN для кассы использовал кто-то другой. PIN заблокирован. Проверьте последние скидки и возвраты в кассе.`))
    .catch(() => {});
  return t;
}
