import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { cdekEnabled, trackUrl } from "@/lib/cdek";
import { fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { ORDER_STATUS, TONE_PILL } from "@/lib/order-status";
import { yookassaEnabled } from "@/lib/yookassa";
import { OrderControls } from "./OrderControls";

const PAY = { PENDING: "ожидает", WAITING_FOR_CAPTURE: "ждёт подтверждения", SUCCEEDED: "оплачен", CANCELED: "отменён", REFUNDED: "возвращён" } as const;
const EVENTS: Record<string, string> = {
  "order.cancel": "Отмена",
  "order.refund": "Возврат денег",
  "order.delivered": "Получен",
  "order.status": "Статус изменён",
  "order.cdek_create": "Создано отправление СДЭК",
  "order.late_payment": "Оплата после отмены",
};

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await db.query.order.findFirst({
    where: eq(s.order.id, id),
    with: { items: { orderBy: asc(s.orderItem.name) }, payments: { orderBy: desc(s.payment.createdAt) }, user: true, promo: true },
  });
  if (!o) notFound();
  const events = await db.query.auditLog.findMany({
    where: and(eq(s.auditLog.entity, "order"), eq(s.auditLog.entityId, o.id)),
    orderBy: desc(s.auditLog.createdAt),
  });
  const actors = await db.query.user.findMany({ columns: { id: true, name: true }, where: (u, { inArray }) => inArray(u.id, events.map((e) => e.actorId).filter((x): x is string => !!x).concat("-")) });
  const st = ORDER_STATUS[o.status];
  const paid = ["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"].includes(o.status);

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/orders">← Заказы</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{o.number}</h1>
        <span className={`pill ${TONE_PILL[st.tone]}`} style={{ fontSize: 14 }}>
          {st.text}
        </span>
      </div>
      {o.cancelReason && <div className="notice notice--muted" style={{ margin: 0 }}>{o.cancelReason}</div>}

      <OrderControls
        id={o.id}
        status={o.status}
        track={o.trackNumber}
        cdek={{ enabled: cdekEnabled(), uuid: o.cdekOrderUuid, canCreate: !!o.cdekCityCode }}
        testPay={!yookassaEnabled()}
        paid={paid}
      />

      <div className="grid-2">
        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ marginBottom: 4 }}>Покупатель</h2>
          <div>
            {o.customerName}
            {o.user && (
              <>
                {" "}
                · <Link href={`/admin/customers/${o.user.id}`}>карточка клиента</Link>
              </>
            )}
          </div>
          <div>
            <a href={`tel:${o.phone}`}>{prettyPhone(o.phone)}</a> · <a href={`mailto:${o.email}`}>{o.email}</a>
          </div>
          {o.comment && (
            <div className="notice notice--muted" style={{ margin: 0 }}>
              «{o.comment}»
            </div>
          )}
          <div className="muted small">Создан {fmtDateTime(o.createdAt)}</div>
          {o.paidAt && <div className="muted small">Оплачен {fmtDateTime(o.paidAt)}</div>}
          {o.shippedAt && <div className="muted small">Отправлен {fmtDateTime(o.shippedAt)}</div>}
          {o.deliveredAt && <div className="muted small">Получен {fmtDateTime(o.deliveredAt)}</div>}
        </div>

        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ marginBottom: 4 }}>Доставка</h2>
          <div>
            {o.deliveryType === "COURIER" ? "Курьер СДЭК" : "Пункт выдачи СДЭК"}
            {o.deliveryTariff ? <span className="muted"> · тариф {o.deliveryTariff}</span> : null}
          </div>
          <div>
            {o.city}
            {o.address ? `, ${o.address}` : ""}
          </div>
          {o.cdekPvzCode && <div className="muted small">Код ПВЗ: {o.cdekPvzCode}</div>}
          {o.deliveryDays && <div className="muted small">Срок по расчёту: {o.deliveryDays} дн.</div>}
          {o.cdekOrderUuid && <div className="muted small">Отправление СДЭК: {o.cdekStatus ?? "создано"}</div>}
          {o.trackNumber && (
            <div>
              Трек:{" "}
              <a href={trackUrl(o.trackNumber)} target="_blank" rel="noreferrer">
                {o.trackNumber}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Состав и оплата</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Цена</th>
                <th>Кол-во</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{rub(i.price)}</td>
                  <td>{i.quantity}</td>
                  <td>{rub(i.price * i.quantity)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="muted">Товары</td>
                <td>{rub(o.subtotal)}</td>
              </tr>
              {o.discount > 0 && (
                <tr>
                  <td colSpan={3} className="muted">Промокод {o.promo?.code}</td>
                  <td>−{rub(o.discount)}</td>
                </tr>
              )}
              {o.bonusSpent > 0 && (
                <tr>
                  <td colSpan={3} className="muted">Бонусами</td>
                  <td>−{rub(o.bonusSpent)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="muted">Доставка</td>
                <td>{rub(o.shippingCost)}</td>
              </tr>
              <tr>
                <td colSpan={3}>
                  <strong>Итого</strong>
                </td>
                <td>
                  <strong>{rub(o.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="muted small">
          Бонусов за заказ: {num(o.bonusAccrued / 100)} {o.bonusCredited ? "· начислены" : "· начислятся после получения"}
        </div>
        {o.payments.map((p) => (
          <div key={p.id} className="muted small">
            ЮKassa {p.externalId}: {PAY[p.status]}, {rub(p.amount)}
            {p.refundedAmount ? `, возвращено ${rub(p.refundedAmount)}` : ""} · {fmtDateTime(p.createdAt)}
          </div>
        ))}
        {!o.payments.length && !yookassaEnabled() && <div className="muted small">ЮKassa не подключена — платежей нет.</div>}
      </div>

      {events.length > 0 && (
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>История</h2>
          {events.map((e) => (
            <div key={e.id} className="row-line" style={{ padding: "10px 0" }}>
              <span>{EVENTS[e.action] ?? e.action}</span>
              <span className="muted small">
                {actors.find((a) => a.id === e.actorId)?.name ?? "система"} · {fmtDateTime(e.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
