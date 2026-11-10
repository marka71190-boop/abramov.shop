/**
 * Курсы ЦБ РФ на сегодня (рублей за 1 доллар, евро, тенге) — для счёта в валюте покупателя из-за рубежа.
 * Берём с cbr.ru раз в 6 часов; ЦБ недоступен — работаем на последних полученных курсах (до 3 суток),
 * а без курсов счёт выставляется в рублях, как раньше.
 */
import "server-only";
import type { PayCurrency } from "@/lib/currency";

export type Rates = Record<PayCurrency, number> & { date: string; fetchedAt: number };

const URL_CBR = () => process.env.CBR_RATES_URL || "https://www.cbr.ru/scripts/XML_daily.asp";
const FRESH_MS = 6 * 3600_000;
const STALE_MS = 3 * 86400_000;

const g = globalThis as unknown as { __asFx?: { rates: Rates | null; failedAt: number } };
const st = (g.__asFx ??= { rates: null, failedAt: 0 });

function parse(xml: string): Rates | null {
  const one = (code: string) => {
    const m = new RegExp(`<CharCode>${code}</CharCode>\\s*<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d,]+)</Value>`).exec(xml);
    if (!m) return 0;
    return Number(m[2].replace(",", ".")) / Number(m[1]);
  };
  const r = { USD: one("USD"), EUR: one("EUR"), KZT: one("KZT") };
  if (!(r.USD > 0 && r.EUR > 0 && r.KZT > 0)) return null;
  const date = /ValCurs Date="([\d.]+)"/.exec(xml)?.[1] ?? "";
  return { ...r, date, fetchedAt: Date.now() };
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
