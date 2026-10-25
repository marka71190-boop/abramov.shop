/**
 * Робокасса: второй способ оплаты — рассрочка, «Сплит», карты иностранных банков и всё,
 * что включено в личном кабинете Робокассы. Покупатель выбирает способ на странице Робокассы.
 *
 * Переменные окружения (только в Timeweb, не в коде):
 *   ROBOKASSA_LOGIN      — идентификатор магазина
 *   ROBOKASSA_PASSWORD1  — Пароль #1 (подпись платежа и возврата покупателя)
 *   ROBOKASSA_PASSWORD2  — Пароль #2 (подпись уведомления об оплате и проверка статуса)
 *   ROBOKASSA_HASH       — алгоритм подписи как в кабинете: md5 (по умолчанию), sha256, sha512…
 *   ROBOKASSA_TEST=1     — тестовый режим (тогда пароли — тестовые из кабинета)
 *   ROBOKASSA_SNO        — система налогообложения для чека (usn_income, usn_income_outcome, osn, patent…); пусто — как в кабинете
 *   ROBOKASSA_TAX        — НДС в чеке: none (по умолчанию), vat0, vat10, vat20…
 *
 * В кабинете Робокассы → Технические настройки:
 *   Result URL  — https://abramov.shop/api/payments/robokassa/result  (метод POST)
 *   Success URL — https://abramov.shop/api/payments/robokassa/success (метод GET)
 *   Fail URL    — https://abramov.shop/api/payments/robokassa/fail    (метод GET)
 */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ReceiptLine } from "@/lib/yookassa";

export const PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
const STATE_URL = "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";

export const robokassaEnabled = () => !!(process.env.ROBOKASSA_LOGIN && process.env.ROBOKASSA_PASSWORD1 && process.env.ROBOKASSA_PASSWORD2);
const login = () => process.env.ROBOKASSA_LOGIN!.trim();
const pass1 = () => process.env.ROBOKASSA_PASSWORD1!.trim();
const pass2 = () => process.env.ROBOKASSA_PASSWORD2!.trim();
const isTest = () => process.env.ROBOKASSA_TEST === "1";

const ALGOS = new Set(["md5", "ripemd160", "sha1", "sha256", "sha384", "sha512"]);
const algo = () => {
  const a = (process.env.ROBOKASSA_HASH || "md5").trim().toLowerCase();
  return ALGOS.has(a) ? a : "md5";
};
const hash = (s: string) => createHash(algo()).update(s, "utf8").digest("hex");

/** Сравнение подписей без утечки по времени, без учёта регистра */
function sameSig(a: string, b: string) {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Копейки → «1234.50» */
export const outSum = (kop: number) => (kop / 100).toFixed(2);

/** Чек по 54-ФЗ для Робочеков (если фискализация включена в кабинете Робокассы) */
function receiptJson(lines: ReceiptLine[]) {
  const tax = (process.env.ROBOKASSA_TAX || "none").trim();
  const sno = process.env.ROBOKASSA_SNO?.trim();
  return JSON.stringify({
    ...(sno ? { sno } : {}),
    items: lines.slice(0, 100).map((l) => ({
      name: l.name.replace(/["\\]/g, "").slice(0, 128),
      quantity: l.quantity,
      sum: Number(((l.price * l.quantity) / 100).toFixed(2)),
      payment_method: l.mode === "advance" ? "advance" : "full_payment",
      payment_object: l.kind,
      tax,
    })),
  });
}

/**
 * Поля формы оплаты (отправляются методом POST — чек может быть длинным).
 * Подпись: MerchantLogin:OutSum:InvId:Receipt:Пароль#1, Receipt — URL-кодированный JSON.
 */
export function paymentForm(p: { invId: number; amount: number; description: string; email: string; receipt: ReceiptLine[] }) {
  const sum = outSum(p.amount);
  const receipt = encodeURIComponent(receiptJson(p.receipt));
  const signature = hash(`${login()}:${sum}:${p.invId}:${receipt}:${pass1()}`);
  return {
    action: PAY_URL,
    fields: {
      MerchantLogin: login(),
      OutSum: sum,
      InvId: String(p.invId),
      Description: p.description.slice(0, 100),
      Receipt: receipt,
      Email: p.email,
      Culture: "ru",
      ...(isTest() ? { IsTest: "1" } : {}),
      SignatureValue: signature,
    } as Record<string, string>,
  };
}

/** Уведомление об оплате (Result URL): подпись OutSum:InvId:Пароль#2 */
export function checkResult(outSumRaw: string, invId: string, signature: string) {
  return sameSig(hash(`${outSumRaw}:${invId}:${pass2()}`), signature);
}

/** Возврат покупателя (Success URL): подпись OutSum:InvId:Пароль#1 */
export function checkSuccess(outSumRaw: string, invId: string, signature: string) {
  return sameSig(hash(`${outSumRaw}:${invId}:${pass1()}`), signature);
}

/** «100.000000» → копейки */
export const toKop = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

export type RkState = "paid" | "pending" | "cancelled" | "refunded" | "unknown";

/**
 * Статус счёта в Робокассе (XML-интерфейс OpStateExt), подпись MerchantLogin:InvoiceID:Пароль#2.
 * Коды состояния: 5 — создан, 10 — отменён без оплаты, 50 — деньги получены, зачисляются,
 * 60 — возвращены, 80 — приостановлен, 100 — оплачен.
 */
export async function opState(invId: number): Promise<{ state: RkState; sum: number | null }> {
  const q = new URLSearchParams({ MerchantLogin: login(), InvoiceID: String(invId), Signature: hash(`${login()}:${invId}:${pass2()}`) });
  if (isTest()) q.set("IsTest", "1");
  const res = await fetch(`${STATE_URL}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const xml = await res.text();
  const result = /<Result>\s*<Code>(\d+)<\/Code>/i.exec(xml)?.[1];
  if (result !== "0") return { state: "unknown", sum: null };
  const code = Number(/<State>\s*<Code>(\d+)<\/Code>/i.exec(xml)?.[1]);
  const sum = /<OutSum>([\d.,]+)<\/OutSum>/i.exec(xml)?.[1];
  const state: RkState = code === 100 ? "paid" : code === 10 ? "cancelled" : code === 60 ? "refunded" : [5, 50, 80].includes(code) ? "pending" : "unknown";
  return { state, sum: sum ? toKop(sum) : null };
}
