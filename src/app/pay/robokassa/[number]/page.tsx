import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtCurrency, PAY_CURRENCY, toCurrencyMinor } from "@/lib/currency";
import { rub } from "@/lib/format";
import { getRates } from "@/lib/fx";
import { getSettings } from "@/lib/settings";
import { splitGift } from "@/lib/giftcards";
import { paymentForm, robokassaEnabled } from "@/lib/robokassa";
import { getViewer } from "@/lib/viewer";
import { receiptLines } from "@/lib/yookassa";
import { AutoSubmit } from "./AutoSubmit";

export const metadata: Metadata = { title: "Переход к оплате", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Прокладка перед Робокассой: создаёт счёт и отправляет форму оплаты */
export default async function RobokassaPay({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const me = await getViewer();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/pay/robokassa/${number}`)}`);
  const o = await db.query.order.findFirst({ where: eq(s.order.number, number), with: { items: { orderBy: asc(s.orderItem.name) } } });
  if (!o || o.userId !== me.id || o.paymentMethod !== "ROBOKASSA") notFound();
  if (o.status !== "AWAITING_PAYMENT" || !robokassaEnabled()) redirect(`/order/${o.number}`);
  if (o.expiresAt && o.expiresAt < new Date()) redirect(`/order/${o.number}`);
  if (o.shippingPending) redirect(`/order/${o.number}`);

  const amount = o.total - o.giftCardAmount;
  // Из-за рубежа — счёт в долларах по курсу ЦБ (нет курса или выключено — в рублях)
  const f = (await getSettings()).foreign;
  const rates = o.country !== "RU" && f.payInCurrency ? await getRates() : null;
  const code = PAY_CURRENCY;
  const curAmount = rates ? toCurrencyMinor(amount, rates.rates[code], f.fxBuffer) : null;
  const currency = curAmount ? { code, amount: curAmount } : null;

  // Один счёт на заказ, пока он не оплачен: повторный переход — тот же InvId (курс держим 12 часов)
  let pay = await db.query.payment.findFirst({
    where: and(eq(s.payment.orderId, o.id), eq(s.payment.provider, "robokassa"), eq(s.payment.status, "PENDING")),
    orderBy: desc(s.payment.createdAt),
  });
  const same =
    pay &&
    pay.amount === amount &&
    (pay.currency ?? null) === (currency?.code ?? null) &&
    (!pay.currency || Date.now() - pay.createdAt.getTime() < 12 * 3600_000);
  if (!pay || !same) {
    const [{ id }] = (await db.execute<{ id: string }>(sql`select nextval('robokassa_inv_seq')::text as id`)).rows;
    [pay] = await db
      .insert(s.payment)
      .values({ orderId: o.id, provider: "robokassa", externalId: id, status: "PENDING", amount, currency: currency?.code ?? null, currencyAmount: currency?.amount ?? null })
      .returning();
  }
  const charge = pay.currency && pay.currencyAmount ? { code: pay.currency, amount: pay.currencyAmount } : null;
  const cash = splitGift(o);
  const form = paymentForm({
    invId: Number(pay.externalId),
    amount,
    description: `Заказ ${o.number} в Abramov Shop`,
    email: o.email,
    currency: charge,
    receipt: receiptLines(
      o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
      cash.cashGoods,
      cash.cashShip,
      { amount: o.foreignFee, percent: o.foreignPercent },
    ),
  });

  return (
    <main className="container page-pad stack" style={{ gap: 16, maxWidth: 560, textAlign: "center", justifyItems: "center", minHeight: "60vh", alignContent: "center" }}>
      <h1 className="h3" style={{ margin: 0 }}>
        Переходим к оплате {charge ? fmtCurrency(charge.amount, charge.code) : rub(amount)}
      </h1>
      {charge && (
        <p className="muted small" style={{ margin: 0 }}>
          Сумма заказа {rub(amount)} — по курсу ЦБ на сегодня. Банк может списать с вашей карты в своей валюте по своему курсу.
        </p>
      )}
      <p className="muted" style={{ margin: 0 }}>
        Сейчас откроется страница Робокассы: там можно оплатить картой, частями, через «Сплит» или картой зарубежного банка.
      </p>
      <AutoSubmit action={form.action} fields={form.fields} />
      <Link href={`/order/${o.number}`} className="small">
        Вернуться к заказу
      </Link>
    </main>
  );
}
