/**
 * ЮKassa (API v3): https://yookassa.ru/developers/api
 *
 * Включается, когда заданы YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 * Тестовый магазин — ключ начинается с test_, деньги не списываются.
 * Чеки по 54-ФЗ: YOOKASSA_SEND_RECEIPT=true (если подключены «Чеки от ЮKassa»).
 */
import "server-only";

const API = () => process.env.YOOKASSA_API_URL || "https://api.yookassa.ru/v3";

export const yookassaEnabled = () => !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
export const yookassaTestMode = () => (process.env.YOOKASSA_SECRET_KEY ?? "").startsWith("test_");
const sendReceipt = () => process.env.YOOKASSA_SEND_RECEIPT === "true";

export type YkStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export interface YkPayment {
  id: string;
  status: YkStatus;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  cancellation_details?: { party?: string; reason?: string };
  captured_at?: string;
  created_at: string;
}

export interface YkRefund {
  id: string;
  status: "pending" | "succeeded" | "canceled";
  amount: { value: string; currency: string };
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("ЮKassa не настроена: нет YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY");
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

async function request<T>(path: string, init: { method: string; body?: unknown; idempotenceKey?: string }): Promise<T> {
  const res = await fetch(API() + path, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.idempotenceKey ? { "Idempotence-Key": init.idempotenceKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { description?: string };
  if (!res.ok) throw new Error(`ЮKassa ${res.status}: ${data.description ?? "ошибка"}`);
  return data;
}

/** Копейки → «1234.50» */
const money = (kop: number) => ({ value: (kop / 100).toFixed(2), currency: "RUB" });
export const fromMoney = (v: { value: string }) => Math.round(Number(v.value) * 100);

export interface ReceiptLine {
  name: string;
  quantity: number;
  price: number; // копейки за 1 шт. — уже со скидкой
  kind: "commodity" | "service";
}

export interface ReceiptCustomer {
  email: string;
  phone?: string | null;
}

function buildReceipt(customer: ReceiptCustomer, lines: ReceiptLine[]) {
  const vat = Number(process.env.YOOKASSA_VAT_CODE || 1); // 1 — без НДС
  return {
    customer: { email: customer.email, ...(customer.phone ? { phone: customer.phone.replace(/\D/g, "") } : {}) },
    items: lines.map((l) => ({
      description: l.name.slice(0, 128),
      quantity: l.quantity,
      amount: money(l.price),
      vat_code: vat,
      payment_mode: "full_payment",
      payment_subject: l.kind,
    })),
  };
}

export async function createPayment(p: {
  orderId: string;
  number: string;
  amount: number;
  returnUrl: string;
  customer: ReceiptCustomer;
  receipt: ReceiptLine[];
}): Promise<YkPayment> {
  const body = (withReceipt: boolean): Record<string, unknown> => ({
    amount: money(p.amount),
    capture: true,
    confirmation: { type: "redirect", return_url: p.returnUrl },
    description: `Заказ ${p.number} в Abramov Shop`.slice(0, 128),
    // Не «orderId»: магазин ЮKassa общий с Kamui, и её обработчик уведомлений не должен принимать наши платежи за свои
    metadata: { shop: "abramov.shop", asOrderId: p.orderId, number: p.number },
    ...(withReceipt ? { receipt: buildReceipt(p.customer, p.receipt) } : {}),
  });
  const first = sendReceipt();
  let payment: YkPayment;
  try {
    payment = await request<YkPayment>("/payments", { method: "POST", body: body(first), idempotenceKey: `order-${p.orderId}` });
  } catch (e) {
    // Магазин требует чек (или, наоборот, чеки не подключены) — пробуем второй вариант
    if (!(e instanceof Error) || !/receipt|чек/i.test(e.message)) throw e;
    console.warn(`[yookassa] ${e.message} — повторяю ${first ? "без чека" : "с чеком"}. Поправьте YOOKASSA_SEND_RECEIPT=${!first}`);
    payment = await request<YkPayment>("/payments", { method: "POST", body: body(!first), idempotenceKey: `order-${p.orderId}-r` });
  }
  if (!payment.confirmation?.confirmation_url) throw new Error("ЮKassa не вернула ссылку на оплату");
  return payment;
}

export function getPayment(id: string) {
  return request<YkPayment>(`/payments/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function createRefund(p: {
  paymentId: string;
  amount: number;
  orderId: string;
  customer: ReceiptCustomer;
  receipt: ReceiptLine[];
}): Promise<YkRefund> {
  const body: Record<string, unknown> = { payment_id: p.paymentId, amount: money(p.amount) };
  if (sendReceipt()) body.receipt = buildReceipt(p.customer, p.receipt);
  return request<YkRefund>("/refunds", { method: "POST", body, idempotenceKey: `refund-${p.orderId}` });
}

/**
 * Делит сумму за товары (после скидки и бонусов) по строкам чека.
 * В чеке цена × количество должна точно совпасть с суммой строки, поэтому
 * строку, которая не делится нацело, разбиваем на две: (n−1) шт. и 1 шт.
 */
export function receiptLines(
  items: { name: string; price: number; quantity: number }[],
  goodsTotal: number,
  shipping: number,
): ReceiptLine[] {
  const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
  const out: ReceiptLine[] = [];
  let left = goodsTotal;
  items.forEach((it, idx) => {
    const line = it.price * it.quantity;
    const share = idx === items.length - 1 ? left : Math.floor((line * goodsTotal) / Math.max(1, subtotal));
    left -= share;
    const unit = Math.floor(share / it.quantity);
    const rest = share - unit * it.quantity;
    if (rest === 0) out.push({ name: it.name, quantity: it.quantity, price: unit, kind: "commodity" });
    else {
      if (it.quantity > 1) out.push({ name: it.name, quantity: it.quantity - 1, price: unit, kind: "commodity" });
      out.push({ name: it.name, quantity: 1, price: unit + rest, kind: "commodity" });
    }
  });
  if (shipping > 0) out.push({ name: "Доставка СДЭК", quantity: 1, price: shipping, kind: "service" });
  return out.filter((l) => l.price > 0);
}
