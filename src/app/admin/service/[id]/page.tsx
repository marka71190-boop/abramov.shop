import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { getClub } from "@/lib/clubs";
import { fmtDateTime, prettyPhone, rub } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { estimate, isEstimateFrom, SERVICE_STATUS, serviceEvents } from "@/lib/service";
import { requireAdmin } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import { ServiceControls } from "./ServiceControls";

export default async function ServiceRequestAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.id, id) });
  if (!r) notFound();
  const [events, club] = await Promise.all([serviceEvents(r.id), getClub(r.clubId)]);
  const st = SERVICE_STATUS[r.status];
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/service">← Мастерская</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{r.number}</h1>
        <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>
      </div>
      <div className="grid-2">
        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ marginBottom: 4 }}>Клиент</h2>
          <div>{r.name}</div>
          <div>
            <a href={`tel:${r.phone}`}>{prettyPhone(r.phone)}</a> · <a href={`mailto:${r.email}`}>{r.email}</a>
          </div>
          <div className="muted small">Заявка от {fmtDateTime(r.createdAt)}</div>
          <div className="small">
            <b>Передаст:</b> {r.handover === "CLUB" ? `в клуб ${club ? `${club.name}, ${club.city}, ${club.address}` : ""}` : "СДЭК"}
          </div>
          <div className="small">
            <b>Забрать:</b> {r.returnMethod === "CLUB" ? `в клубе ${club ? `${club.name}, ${club.city}` : ""}` : `СДЭК — ${r.returnAddress ?? ""}`}
          </div>
        </div>
        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ marginBottom: 4 }}>Работы</h2>
          {r.items.map((i) => (
            <div key={i.id} className="summary__row small">
              <span>{i.name}</span>
              <span className="muted">
                {i.priceFrom ? "от " : ""}
                {rub(i.price)} · {i.days} дн.
              </span>
            </div>
          ))}
          <div className="small">
            По прайсу: {isEstimateFrom(r) ? "от " : ""}
            {rub(estimate(r))}
            {r.price != null && (
              <>
                {" "}
                · итог мастера: <b>{rub(r.price)}</b>
              </>
            )}
            {r.paidAt && <span className="pill pill--ok" style={{ marginLeft: 8 }}>{r.paymentStatus === "OFFLINE" ? "оплачено на месте" : "оплачено онлайн"}</span>}
          </div>
          {r.description && <div className="small" style={{ whiteSpace: "pre-line" }}>«{r.description}»</div>}
          {r.photos.length > 0 && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {r.photos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="" style={{ width: 96, height: 96, objectFit: "cover", border: "1px solid var(--c-line)" }} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <ServiceControls
        id={r.id}
        status={r.status}
        price={r.price}
        readyBy={r.readyBy ? new Date(+new Date(r.readyBy) + 3 * 3600_000).toISOString().slice(0, 10) : ""}
        paid={!!r.paidAt}
        billed={!!r.payUrl}
        online={yookassaEnabled()}
        events={events.map((e) => ({ id: e.id, status: SERVICE_STATUS[e.status].text, note: e.note, photo: e.photo, at: fmtDateTime(e.createdAt) }))}
      />
    </>
  );
}
