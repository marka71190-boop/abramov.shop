/**
 * Курсы ЦБ РФ на сегодня (рублей за 1 единицу валюты, все ~40 валют ЦБ) — счёт Робокассы в долларах
 * и цены на сайте в валюте страны покупателя.
 * Берём с cbr.ru раз в 6 часов; ЦБ недоступен — работаем на последних полученных курсах (до 3 суток),
 * а без курсов счёт выставляется в рублях, как раньше.
 */
import "server-only";
export interface Rates {
  rates: Record<string, number>; // код → рублей за 1 единицу; RUB = 1
  date: string;
  fetchedAt: number;
}

const URL_CBR = () => process.env.CBR_RATES_URL || "https://www.cbr.ru/scripts/XML_daily.asp";
const FRESH_MS = 6 * 3600_000;
const STALE_MS = 3 * 86400_000;

const g = globalThis as unknown as { __asFx?: { rates: Rates | null; failedAt: number } };
const st = (g.__asFx ??= { rates: null, failedAt: 0 });

function parse(xml: string): Rates | null {
  const rates: Record<string, number> = { RUB: 1 };
  for (const v of xml.split("</Valute>")) {
    const code = /<CharCode>([A-Z]{3})<\/CharCode>/.exec(v)?.[1];
    const nominal = Number(/<Nominal>(\d+)<\/Nominal>/.exec(v)?.[1]);
    const value = Number(/<Value>([\d,]+)<\/Value>/.exec(v)?.[1]?.replace(",", "."));
    if (code && nominal > 0 && value > 0) rates[code] = value / nominal;
  }
  if (!(rates.USD > 0)) return null;
  const date = /ValCurs Date="([\d.]+)"/.exec(xml)?.[1] ?? "";
  return { rates, date, fetchedAt: Date.now() };
}

/** Курсы ЦБ; null — нет ни свежих, ни недавних */
export async function getRates(): Promise<Rates | null> {
  const now = Date.now();
  if (st.rates && now - st.rates.fetchedAt < FRESH_MS) return st.rates;
  if (now - st.failedAt > 5 * 60_000) {
    try {
      const res = await fetch(URL_CBR(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
      // Ответ ЦБ в windows-1251, но коды валют и цифры — латиница
      const xml = new TextDecoder("latin1").decode(await res.arrayBuffer());
      const r = res.ok ? parse(xml) : null;
      if (!r) throw new Error(`ЦБ ответил ${res.status} без курсов`);
      st.rates = r;
      void import("@/lib/watchdog").then((w) => w.report("fx", true)).catch(() => {});
      return r;
    } catch (e) {
      st.failedAt = now;
      void import("@/lib/watchdog").then((w) => w.report("fx", false, e)).catch(() => {});
    }
  }
  return st.rates && now - st.rates.fetchedAt < STALE_MS ? st.rates : null;
}
