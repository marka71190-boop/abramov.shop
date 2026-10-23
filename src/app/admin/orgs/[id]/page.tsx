import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDateTime, prettyPhone, rub } from "@/lib/format";
import { orderStatus, TONE_PILL } from "@/lib/order-status";
import { requireAdmin } from "@/lib/viewer";
import { ORG_KIND, ORG_STATUS } from "@/lib/wholesale";
import { Decision, Members } from "./forms";

export default async function OrgAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const o = await db.query.organization.findFirst({ where: eq(s.organization.id, id) });
  if (!o) notFound();
  const [members, orders, reviewer] = await Promise.all([
    db.query.user.findMany({ where: eq(s.user.organizationId, o.id), columns: { id: true, name: true, email: true } }),
    db.query.order.findMany({ where: and(eq(s.order.organizationId, o.id), inArray(s.order.status, ["AWAITING_PAYMENT", "PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"])), orderBy: desc(s.order.createdAt), limit: 50 }),
    o.reviewedById ? db.query.user.findFirst({ where: eq(s.user.id, o.reviewedById), columns: { name: true } }) : null,
  ]);
  const st = ORG_STATUS[o.status];
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/orgs">← Организации</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{o.name}</h1>
        <span className={`pill ${TONE_PILL[st.tone]}`} style={{ fontSize: 14 }}>
          {st.text}
        </span>
      </div>
      <div className="grid-2">
        <div className="panel stack" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 4 }}>Реквизиты</h2>
          <div>
            ИНН <b>{o.inn}</b> {o.kpp && <>· КПП {o.kpp}</>} {o.ogrn && <>· ОГРН {o.ogrn}</>}
          </div>
          <div className="small">{o.legalAddress}</div>
          <div className="small">
            <a href={`https://egrul.nalog.ru/index.html?query=${o.inn}`} target="_blank" rel="noreferrer">
              Проверить в ЕГРЮЛ (ФНС) →
            </a>
          </div>
          <div className="muted small">
            {ORG_KIND[o.kind] ?? o.kind}
            {o.city ? `, ${o.city}` : ""}
            {o.tables ? ` · столов: ${o.tables}` : ""}
          </div>
          {o.website && <div className="small">Сайт: {o.website}</div>}
          {o.comment && <div className="notice notice--muted" style={{ margin: 0 }}>«{o.comment}»</div>}
        </div>
        <div className="panel stack" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 4 }}>Контакт</h2>
          <div>{o.contactName}</div>
          <div>
            <a href={`tel:${o.contactPhone}`}>{prettyPhone(o.contactPhone)}</a> · <a href={`mailto:${o.contactEmail}`}>{o.contactEmail}</a>
          </div>
          <div className="muted small">Заявка {fmtDateTime(o.createdAt)}</div>
          {o.reviewedAt && (
            <div className="muted small">
              Решение {fmtDateTime(o.reviewedAt)}
              {reviewer ? ` · ${reviewer.name}` : ""}
              {o.rejectReason ? ` · «${o.rejectReason}»` : ""}
            </div>
          )}
        </div>
      </div>
      <Decision id={o.id} status={o.status} />
      <Members id={o.id} members={members} />
      {orders.length > 0 && (
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Заказы</h2>
          {orders.map((x) => {
            const os = orderStatus(x.status, x.deliveryType);
            return (
              <div key={x.id} className="row-line">
                <span>
                  <Link href={`/admin/orders/${x.id}`}>{x.number}</Link> <span className="muted small">· {x.paymentMethod === "INVOICE" ? "по счёту" : "картой"}</span>
                </span>
                <span className="row" style={{ gap: 10 }}>
                  {rub(x.total)} <span className={`pill ${TONE_PILL[os.tone]}`}>{os.text}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
