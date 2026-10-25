import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { rub } from "@/lib/format";
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

  const amount = o.total - o.giftCardAmount;
  // Один счёт на заказ, пока он не оплачен: повторный переход — тот же InvId
  let pay = await db.query.payment.findFirst({
    where: and(eq(s.payment.orderId, o.id), eq(s.payment.provider, "robokassa"), eq(s.payment.status, "PENDING")),
    orderBy: desc(s.payment.createdAt),
  });
  if (!pay || pay.amount !== amount) {
    const [{ id }] = (await db.execute<{ id: string }>(sql`select nextval('robokassa_inv_seq')::text as id`)).rows;
    [pay] = await db.insert(s.payment).values({ orderId: o.id, provider: "robokassa", externalId: id, status: "PENDING", amount }).returning();
  }
  const cash = splitGift(o);
  const form = paymentForm({
    invId: Number(pay.externalId),
    amount,
    description: `Заказ ${o.number} в Abramov Shop`,
    email: o.email,
    receipt: receiptLines(
      o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
      cash.cashGoods,
      cash.cashShip,
    ),
  });

  return (
    <main className="container page-pad stack" style={{ gap: 16, maxWidth: 560, textAlign: "center", justifyItems: "center", minHeight: "60vh", alignContent: "center" }}>
      <h1 className="h3" style={{ margin: 0 }}>
        Переходим к оплате {rub(amount)}
      </h1>
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
