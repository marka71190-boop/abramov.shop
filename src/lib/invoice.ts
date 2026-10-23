/** Счёт на оплату для организаций: QR-код для банковского приложения, сумма прописью, уведомления. */
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDate, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/settings-defaults";
import { SELLER, SITE } from "@/lib/site";

type OrderRow = typeof s.order.$inferSelect;

/** Назначение платежа */
export const invoicePurpose = (o: Pick<OrderRow, "number" | "createdAt">, vat: string) => `Оплата по счёту № ${o.number} от ${fmtDate(o.createdAt)}. ${vat}`;

/**
 * Строка для QR-кода платежа (ГОСТ Р 56042-2014, формат ST00012):
 * банковское приложение организации сразу заполняет платёжку
 */
export function invoiceQrText(o: Pick<OrderRow, "number" | "createdAt" | "total">, b: SiteSettings["b2b"]) {
  const clean = (x: string) => x.replace(/[|\n\r]/g, " ").trim();
  return [
    "ST00012",
    `Name=${clean(SELLER.name)}`,
    `PersonalAcc=${clean(b.account)}`,
    `BankName=${clean(b.bankName)}`,
    `BIC=${clean(b.bik)}`,
    `CorrespAcc=${clean(b.corrAccount)}`,
    `PayeeINN=${SELLER.inn}`,
    `Sum=${o.total}`,
    `Purpose=${clean(invoicePurpose(o, b.vatNote))}`,
  ].join("|");
}

// ---------- Сумма прописью: «Двенадцать тысяч триста рублей 00 копеек»

const ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function triad(n: number, female: boolean) {
  const out: string[] = [];
  out.push(HUNDREDS[Math.floor(n / 100)]);
  const t = n % 100;
  if (t >= 10 && t < 20) out.push(TEENS[t - 10]);
  else {
    out.push(TENS[Math.floor(t / 10)]);
    out.push((female ? ONES_F : ONES)[t % 10]);
  }
  return out.filter(Boolean).join(" ");
}

export function rublesInWords(kop: number) {
  const rubles = Math.floor(kop / 100);
  const k = kop % 100;
  const parts: string[] = [];
  const groups: [number, boolean, [string, string, string]][] = [
    [Math.floor(rubles / 1e9) % 1000, false, ["миллиард", "миллиарда", "миллиардов"]],
    [Math.floor(rubles / 1e6) % 1000, false, ["миллион", "миллиона", "миллионов"]],
    [Math.floor(rubles / 1e3) % 1000, true, ["тысяча", "тысячи", "тысяч"]],
  ];
  for (const [n, f, w] of groups) if (n) parts.push(`${triad(n, f)} ${plural(n, ...w)}`);
  const r = rubles % 1000;
  if (r || !rubles) parts.push(r ? triad(r, false) : "ноль");
  const text = `${parts.join(" ")} ${plural(rubles, "рубль", "рубля", "рублей")} ${String(k).padStart(2, "0")} ${plural(k, "копейка", "копейки", "копеек")}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Заказ по счёту создан: письмо покупателю со ссылкой на счёт, сообщение админам (без персональных данных) */
export async function invoiceCreated(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o) return;
  const settings = await getSettings();
  const until = o.expiresAt ? fmtDate(o.expiresAt) : null;
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  if (mailEnabled()) {
    await sendMail(
      o.email,
      `Счёт на оплату заказа ${o.number}`,
      "Счёт на оплату",
      `Заказ <b>${o.number}</b> на сумму <b>${rub(o.total)}</b> принят и зарезервирован${until ? ` до ${until}` : ""}.<br><br>` +
        `Счёт можно распечатать или сохранить в PDF на странице заказа, в нём есть QR-код для оплаты из банковского приложения. ` +
        `Как только оплата поступит, начнём собирать заказ.` +
        (settings.b2b.invoiceDays ? `<br><br><span style="color:#a3a3a8">Если оплата не поступит за ${settings.b2b.invoiceDays} дн., резерв снимется автоматически.</span>` : ""),
      { text: "Открыть счёт", url: `${SITE.url}/print/invoice/${o.number}` },
    ).catch((e) => console.error("[invoice] письмо:", e));
  }
  const { notifyAdmins } = await import("@/lib/telegram");
  await notifyAdmins(`🧾 <b>Заказ ${o.number} по счёту</b> — ${rub(o.total)}\nЖдём оплату${until ? ` до ${until}` : ""}. Когда деньги придут — отметьте в админке.`, {
    text: "Открыть в админке",
    url: `${SITE.url}/admin/orders/${o.id}`,
  });
}
