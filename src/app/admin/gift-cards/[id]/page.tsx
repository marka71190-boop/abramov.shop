import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GiftCardView } from "@/components/gift/GiftCardView";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime, rub } from "@/lib/format";
import { giftUrl } from "@/lib/giftcards";
import { ORDER_STATUS } from "@/lib/order-status";
import { requireAdmin } from "@/lib/viewer";
import { STATUS_PILL } from "../status";
import { GiftControls } from "./GiftControls";

export default async function GiftCardAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  await requireAdmin("OWNER");
  const [{ id }, { issued }] = await Promise.all([params, searchParams]);
  const c = await db.query.giftCard.findFirst({ where: eq(s.giftCard.id, id), with: { buyer: { columns: { id: true, name: true } } } });
  if (!c) notFound();
  const uses = await db.query.giftCardUse.findMany({
    where: eq(s.giftCardUse.giftCardId, c.id),
    orderBy: desc(s.giftCardUse.createdAt),
    with: { order: { columns: { id: true, number: true, status: true } } },
  });
  const st = STATUS_PILL(c);
  const active = c.status === "ACTIVE";
  const pendingUse = uses.some((u) => !u.reversedAt && u.order.status === "AWAITING_PAYMENT");

  const rows: [string, React.ReactNode][] = [
    ["Статус", <span key="s" className={`pill ${st.tone}`}>{st.text}</span>],
    ["Остаток", rub(c.balance)],
    ["Откуда", c.source === "SITE" ? "куплен на сайте" : "выпущен в админке"],
    ["Действует до", c.expiresAt ? fmtDate(c.expiresAt) : active ? "бессрочно" : "—"],
    ["Покупатель", c.buyer ? <Link key="b" href={`/admin/customers/${c.buyer.id}`}>{c.buyer.name}</Link> : c.buyerEmail ?? "—"],
    ["Почта для чека", c.buyerEmail ?? "—"],
    [
      "Получатель",
      c.recipientEmail
        ? `${c.recipientEmail} — ${c.sentAt ? `письмо отправлено ${fmtDateTime(c.sentAt)}` : c.sendAt ? `письмо уйдёт ${fmtDateTime(c.sendAt)}` : "письмо ещё не ушло"}`
        : "почту не указали",
    ],
    ["Оплата", c.paidAt ? `${fmtDateTime(c.paidAt)}${c.paymentId ? ` · ЮKassa ${c.paymentId}` : ""}` : c.paymentId ? `ЮKassa ${c.paymentId}, не оплачен` : "—"],
    ["Деньги возвращены", c.refundedAt ? fmtDateTime(c.refundedAt) : null],
    ["Заметка", c.note],
    ["Создан", fmtDateTime(c.createdAt)],
  ];

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/gift-cards">← Сертификаты</Link>
      </p>
      <h1>Сертификат {c.code}</h1>
      {issued && <div className="form-ok">Сертификат выпущен.{c.recipientEmail ? " Письмо получателю отправляем." : " Ссылку на него можно переслать или распечатать."}</div>}
      <div className="grid-2">
        <div className="stack">
          <GiftCardView id="adm" amount={c.initialAmount} code={c.code} recipientName={c.recipientName} senderName={c.senderName} message={c.message} expiresAt={c.expiresAt} />
          {c.status !== "PENDING" && (
            <p className="small" style={{ margin: 0 }}>
              Страница сертификата для получателя:{" "}
              <a href={giftUrl(c.token)} target="_blank" rel="noreferrer">
                открыть
              </a>{" "}
              — по ней видно код, поэтому пересылайте только получателю.
            </p>
          )}
        </div>
        <div className="panel stack" style={{ gap: 8 }}>
          {rows
            .filter(([, v]) => v != null && v !== "" && v !== "—")
            .map(([k, v]) => (
              <div key={k} className="summary__row" style={{ margin: 0, alignItems: "flex-start" }}>
                <span className="muted">{k}</span>
                <span style={{ textAlign: "right" }}>{v}</span>
              </div>
            ))}
        </div>
      </div>

      <GiftControls
        id={c.id}
        active={active}
        canRefund={c.source === "SITE" && !!c.paidAt && !c.refundedAt && c.balance > 0 && !pendingUse}
        refundAmount={rub(c.balance)}
        canResendBuyer={active && !!c.buyerEmail}
        canSendRecipient={active && !!c.recipientEmail && !c.sentAt}
      />

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Оплаты заказов</h2>
        {uses.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Сумма</th>
                  <th>Когда</th>
                  <th>Чек зачёта аванса</th>
                </tr>
              </thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/orders/${u.order.id}`}>{u.order.number}</Link>
                      <div className="muted small">{ORDER_STATUS[u.order.status].text}</div>
                    </td>
                    <td>
                      {rub(u.amount)}
                      {u.reversedAt && <div className="muted small">вернулось на сертификат {fmtDate(u.reversedAt)}</div>}
                    </td>
                    <td className="small">{fmtDateTime(u.createdAt)}</td>
                    <td className="small">
                      {c.source !== "SITE"
                        ? "не нужен — выпущен в админке"
                        : u.receiptId
                          ? u.receiptId === "not-required"
                            ? "чеки ЮKassa выключены"
                            : `отправлен · ${u.receiptId}`
                          : u.receiptError
                            ? <span style={{ color: "var(--c-danger)" }}>не отправлен: {u.receiptError}. Повторим автоматически</span>
                            : u.reversedAt
                              ? "—"
                              : "после оплаты заказа"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Сертификатом ещё ничего не оплачивали.
          </p>
        )}
      </div>
    </>
  );
}
