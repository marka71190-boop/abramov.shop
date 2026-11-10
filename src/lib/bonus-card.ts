/**
 * Бонусная карта в телефоне: QR, который покупатель показывает на кассе клуба вместо телефона.
 *
 * В QR — номер аккаунта, срок и подпись сервера (HMAC от BETTER_AUTH_SECRET). Код живёт 30 минут
 * и обновляется на экране каждую минуту: сфотографированная чужая карта быстро перестаёт работать,
 * а подделать код без секрета нельзя. Ни телефона, ни почты, ни имени в QR нет.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CARD_PREFIX = "ABC.";
const TTL_MS = 30 * 60_000;

function secret() {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET не задан");
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`bonus-card:${payload}`).digest("base64url").slice(0, 22);

/** Код карты для QR: ABC.<аккаунт>.<срок>.<подпись> */
export function cardToken(userId: string, now = Date.now()) {
  const payload = `${userId}.${Math.floor((now + TTL_MS) / 1000).toString(36)}`;
  return `${CARD_PREFIX}${payload}.${sign(payload)}`;
}

export const looksLikeCard = (raw: string) => raw.trim().startsWith(CARD_PREFIX);

/** Аккаунт по коду карты; null — код чужой, испорчен или устарел */
export function readCardToken(raw: string, now = Date.now()): string | null {
  const m = /^ABC\.([\w-]{1,64})\.([0-9a-z]{1,10})\.([\w-]{22})$/.exec(raw.trim());
  if (!m) return null;
  const [, userId, exp, sig] = m;
  const want = Buffer.from(sign(`${userId}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (parseInt(exp, 36) * 1000 < now) return null;
  return userId;
}
