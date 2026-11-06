/** Заказы из-за рубежа: настройки и страна покупателя (только на сервере). */
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { cleanCountryName, countryLabel, countryMode, MANUAL_CODE, parseCountries, type Country, type CountryMode } from "@/lib/countries";
import { getSettings } from "@/lib/settings";

export async function cdekCountries(): Promise<Country[]> {
  const f = (await getSettings()).foreign;
  return f.enabled ? parseCountries(f.cdekCountries) : [];
}

/** Что видит покупатель на оформлении и в кабинете */
export async function foreignConfig() {
  const f = (await getSettings()).foreign;
  return {
    enabled: f.enabled,
    countries: f.enabled ? parseCountries(f.cdekCountries) : [],
    robokassaPercent: f.robokassaPercent,
    transferPercent: f.transferPercent,
    transferReady: !!f.transferDetails.trim(),
    paymentDays: f.paymentDays,
    intro: f.intro,
  };
}
export type ForeignConfig = Awaited<ReturnType<typeof foreignConfig>>;

/**
 * Проверяет страну из формы: код из списка СДЭК, RU, или XX + название.
 * Возвращает null, если страна не подходит (например, заказы из-за рубежа выключены).
 */
export async function resolveCountry(code: string | null | undefined, name?: string | null): Promise<{ code: string; name: string | null; mode: CountryMode } | null> {
  const c = String(code || "RU").toUpperCase().slice(0, 2);
  if (c === "RU") return { code: "RU", name: null, mode: "RU" };
  const f = (await getSettings()).foreign;
  if (!f.enabled) return null;
  const list = parseCountries(f.cdekCountries);
  if (c === MANUAL_CODE) {
    const n = cleanCountryName(name ?? "");
    if (n.length < 2) return null;
    // Вписал страну из списка СДЭК или Россию — считаем выбранной из списка
    const hit = list.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (hit) return { code: hit.code, name: null, mode: "CDEK" };
    if (/^(россия|рф|russia)$/i.test(n)) return { code: "RU", name: null, mode: "RU" };
    return { code: MANUAL_CODE, name: n, mode: "MANUAL" };
  }
  if (!list.some((x) => x.code === c)) return null;
  return { code: c, name: null, mode: countryMode(c, list) };
}

/** tin: undefined — не трогать; строка — сохранить (только для страны, где он нужен) */
export async function setUserCountry(userId: string, code: string, name: string | null, tin?: string | null) {
  const { tinRule } = await import("@/lib/countries");
  await db
    .update(s.user)
    .set({ country: code, countryName: code === MANUAL_CODE ? name : null, ...(tin !== undefined ? { tin: tinRule(code) ? tin || null : null } : {}) })
    .where(eq(s.user.id, userId));
}

export async function countryText(code: string | null | undefined, name: string | null | undefined) {
  return countryLabel(code, name, await cdekCountries());
}

/** Процент сбора для способа оплаты из-за рубежа */
export async function foreignPercent(method: "ROBOKASSA" | "TRANSFER") {
  const f = (await getSettings()).foreign;
  return Math.max(0, Math.min(50, Math.round(method === "ROBOKASSA" ? f.robokassaPercent : f.transferPercent)));
}
