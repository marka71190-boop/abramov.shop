import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { trackUrl } from "@/lib/cdek";
import { fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { ORDER_STATUS, STEPS, TONE_COLOR } from "@/lib/order-status";
import { getPayUrl, syncPayment } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { isAdmin, requireUser } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import { AutoRefresh, CancelButton, TestPayButton } from "./OrderActions";

export const metadata: Metadata = { title: "Заказ", robots: { index: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ from?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, { from }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/order/${number}`);
  let o = await db.query.order.findFirst({ where: eq(s.order.number, number) });
  if (!o || (o.userId !== user.id && !isAdmin(user))) notFound();

  // Вернулись со страницы оплаты — не ждём уведомление, спрашиваем ЮKassa сами
  if (o.status === "AWAITING_PAYMENT") {
    await syncPayment(o.id);
    o = (await db.query.order.findFirst({ where: eq(s.order.id, o.id) }))!;
  }

  const [items, settings, payUrl] = await Promise.all([
    db.query.orderItem.findMany({
      where: eq(s.orderItem.orderId, o.id),
      orderBy: asc(s.orderItem.name),
      with: { product: { columns: { slug: true }, with: { images: { limit: 1, orderBy: asc(s.productImage.sortOrder) } } } },
    }),
    getSettings(),
    o.status === "AWAITING_PAYMENT" ? getPayUrl(o.id) : null,
  ]);

  const st = ORDER_STATUS[o.status];
  const stepIdx = STEPS.findIndex((x) => x.key === o.status);
  const awaiting = o.status === "AWAITING_PAYMENT";
  const minutesLeft = o.expiresAt ? Math.max(0, Math.round((+o.expiresAt - Date.now()) / 60000)) : null;
  const justPaid = from === "pay" && o.status === "PAID";

  return (
    <section className="container page-pad order-page">
      <p className="small" style={{ margin: "0 0 16px" }}>
        <Link href="/account#orders">← Мои заказы</Link>
      </p>
      <div className="order-head">
        <div>
          <div className="label">Заказ от {fmtDateTime(o.createdAt)}</div>
          <h1 className="h2">{o.number}</h1>
        </div>
        <div className="order-status" style={{ color: TONE_COLOR[st.tone] }}>
          <span style={{ background: TONE_COLOR[st.tone] }} />
          {st.text}
        </div>
      </div>

      {justPaid && (
        <div className="hero-note">
          <div className="h3">Спасибо, оплата прошла</div>
          <p className="muted" style={{ margin: 0 }}>
            Мы соберём заказ и отправим трек-номер СДЭК. Бонусы ({num(o.bonusAccrued / 100)}) начислятся после получения.
          </p>
        </div>
      )}

      {awaiting && (
        <div className="panel stack pay-box">
          <div>
            <div className="h3">Ожидаем оплату</div>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {from === "pay"
                ? "Проверяем оплату — обычно это занимает несколько секунд."
                : `Товар зарезервирован${minutesLeft != null ? ` ещё на ${minutesLeft} мин.` : ""} Если не оплатить, заказ отменится автоматически.`}
            </p>
          </div>
          <div className="row">
            {payUrl && (
              <a className="btn btn--gold" href={payUrl}>
                Оплатить {rub(o.total)}
              </a>
            )}
            {!yookassaEnabled() && isAdmin(user) && <TestPayButton number={o.number} />}
            {o.userId === user.id && <CancelButton number={o.number} />}
          </div>
          {from === "pay" && <AutoRefresh seconds={4} />}
        </div>
      )}

      {(o.status === "CANCELLED" || o.status === "REFUNDED") && o.cancelReason && (
        <div className="notice notice--muted" style={{ margin: 0 }}>
          {o.cancelReason}
        </div>
      )}

      {stepIdx >= 0 && (
        <ol className="steps" aria-label="Статус заказа">
          {STEPS.map((x, i) => (
            <li key={x.key} data-done={i <= stepIdx || undefined}>
              {x.label}
            </li>
          ))}
        </ol>
      )}

      <div className="order-grid">
        <div className="panel">
          <h2>Состав</h2>
          {items.map((i) => (
            <div key={i.id} className="order-item">
              {i.product?.images[0] ? <img src={i.product.images[0].url} alt="" /> : <span />}
              <div style={{ flex: 1 }}>
                {i.product ? <Link href={`/product/${i.product.slug}`}>{i.name}</Link> : i.name}
                <div className="muted small">
                  {i.quantity} × {rub(i.price)}
                </div>
              </div>
              <div>{rub(i.price * i.quantity)}</div>
            </div>
          ))}
          <div className="summary__row" style={{ marginTop: 16 }}>
            <span>Товары</span>
            <span>{rub(o.subtotal)}</span>
          </div>
          {o.discount > 0 && (
            <div className="summary__row good">
              <span>Промокод</span>
              <span>−{rub(o.discount)}</span>
            </div>
          )}
          {o.bonusSpent > 0 && (
            <div className="summary__row good">
              <span>Бонусы</span>
              <span>−{rub(o.bonusSpent)}</span>
            </div>
          )}
          <div className="summary__row">
            <span>Доставка</span>
            <span>{o.shippingCost ? rub(o.shippingCost) : "бесплатно"}</span>
          </div>
          <div className="summary__total">
            <span>{o.paidAt ? "Оплачено" : "К оплате"}</span>
            <span>{rub(o.total)}</span>
          </div>
        </div>

        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Доставка</h2>
          <div>
            <div className="label">{o.deliveryType === "COURIER" ? "Курьер СДЭК" : "Пункт выдачи СДЭК"}</div>
            <div style={{ marginTop: 6 }}>
              {o.city}
              {o.address ? `, ${o.address}` : ""}
            </div>
            {o.deliveryDays && <div className="muted small">Срок: {o.deliveryDays} дн. после отправки</div>}
          </div>
          {o.trackNumber && (
            <div>
              <div className="label">Трек-номер</div>
              <a href={trackUrl(o.trackNumber)} target="_blank" rel="noopener noreferrer" className="code-box" style={{ marginTop: 6, textDecoration: "none" }}>
                {o.trackNumber}
              </a>
            </div>
          )}
          <div>
            <div className="label">Получатель</div>
            <div style={{ marginTop: 6 }}>{o.customerName}</div>
            <div className="muted small">
              {prettyPhone(o.phone)} · {o.email}
            </div>
          </div>
          <div className="muted small">
            Вопрос по заказу? <a href={`https://t.me/${settings.supportTelegram}`}>@{settings.supportTelegram}</a> — назовите номер {o.number}
          </div>
        </div>
      </div>
    </section>
  );
}
