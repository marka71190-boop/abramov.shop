import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { clubMapUrl, getClub } from "@/lib/clubs";
import { fmtDate, fmtDateTime, rub } from "@/lib/format";
import { TONE_COLOR } from "@/lib/order-status";
import { estimate, isEstimateFrom, SERVICE_STATUS, serviceEvents, syncServicePayment } from "@/lib/service";
import { getSettings } from "@/lib/settings";
import { isAdmin, requireUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Заявка в мастерскую", robots: { index: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ from?: string; new?: string }> };

export default async function ServiceRequestPage({ params, searchParams }: Props) {
  const [{ number }, { from, new: isNew }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/service/${number}`);
  let r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.number, number) });
  if (!r || (r.userId !== user.id && !isAdmin(user))) notFound();
  if (from === "pay" && !r.paidAt) {
    await syncServicePayment(r);
    r = (await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.id, r.id) }))!;
  }
  const [events, club, settings] = await Promise.all([serviceEvents(r.id), getClub(r.clubId), getSettings()]);
  const st = SERVICE_STATUS[r.status];
  const price = r.price ?? null;

  return (
    <section className="container page-pad stack" style={{ gap: 20, maxWidth: 900 }}>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/account#service">← Мои заявки</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="eyebrow">Заявка в мастерскую от {fmtDateTime(r.createdAt)}</div>
          <h1 className="h2" style={{ margin: 0 }}>
            {r.number}
          </h1>
        </div>
        <div style={{ color: TONE_COLOR[st.tone], fontFamily: "var(--font-display)", fontSize: 22, textTransform: "uppercase" }}>● {st.text}</div>
      </div>

      {isNew && (
        <div className="hero-note">
          <div className="h3">Заявка отправлена</div>
          <p className="muted" style={{ margin: 0 }}>
            Письмо с инструкцией уже на почте. Когда мастер посмотрит кий, назовём точную цену и срок.
          </p>
        </div>
      )}

      {r.status === "NEW" && (
        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>Как передать кий</h2>
          {r.handover === "CLUB" && club ? (
            <>
              <div>
                Принесите кий в клуб и назовите номер заявки <b>{r.number}</b>:
              </div>
              <div>
                <b>{club.name}</b>, {club.city}, {club.address}
                {club.workTime && <div className="muted small">{club.workTime}</div>}
              </div>
              <a href={clubMapUrl(club)} target="_blank" rel="noreferrer" className="small">
                Как добраться →
              </a>
            </>
          ) : (
            <>
              <div>Отправьте кий СДЭК в тубусе или жёсткой упаковке по адресу:</div>
              <div className="code-box" style={{ whiteSpace: "pre-line" }}>
                {settings.service.cdekAddress}
              </div>
              <div className="small">
                В комментарии к отправлению укажите номер заявки <b>{r.number}</b>.
              </div>
            </>
          )}
        </div>
      )}

      {price != null && !r.paidAt && r.payUrl && r.status !== "CANCELLED" && (
        <div className="panel stack pay-box">
          <div className="h3" style={{ margin: 0 }}>
            К оплате {rub(price)}
          </div>
          <a className="btn btn--gold" href={r.payUrl}>
            Оплатить {rub(price)}
          </a>
          <span className="muted small">Картой, через СБП или SberPay. Чек придёт на почту.</span>
        </div>
      )}

      <div className="order-grid">
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Работы</h2>
          {r.items.map((i) => (
            <div key={i.id} className="summary__row">
              <span>{i.name}</span>
              <span className="muted">
                {i.priceFrom ? "от " : ""}
                {rub(i.price)}
              </span>
            </div>
          ))}
          <div className="summary__total">
            <span>{price != null ? (r.paidAt ? "Оплачено" : "Итого") : "Ориентировочно"}</span>
            <span>
              {price == null && isEstimateFrom(r) ? "от " : ""}
              {rub(price ?? estimate(r))}
            </span>
          </div>
          {r.readyBy && r.status !== "DONE" && <div className="small">Будет готов к {fmtDate(r.readyBy)}</div>}
          {r.description && (
            <div className="small muted" style={{ whiteSpace: "pre-line" }}>
              «{r.description}»
            </div>
          )}
          {r.photos.length > 0 && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {r.photos.map((u) => (
                <img key={u} src={u} alt="" style={{ width: 72, height: 72, objectFit: "cover", border: "1px solid var(--c-line)" }} />
              ))}
            </div>
          )}
        </div>

        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Ход работ</h2>
          <ol className="prod-steps">
            {events.map((e) => (
              <li key={e.id}>
                <div>
                  <b>{SERVICE_STATUS[e.status].text}</b> <span className="muted small">· {fmtDateTime(e.createdAt)}</span>
                </div>
                {e.note && (
                  <div className="small" style={{ whiteSpace: "pre-line" }}>
                    {e.note}
                    <span className="muted"> — мастер</span>
                  </div>
                )}
                {e.photo && <img src={e.photo} alt="" className="prod-photo" />}
              </li>
            ))}
          </ol>
          <div className="small muted">
            Забрать: {r.returnMethod === "CLUB" ? (club ? `${club.name}, ${club.city}, ${club.address}` : "в клубе") : `СДЭК — ${r.returnAddress ?? ""}`}
          </div>
        </div>
      </div>
    </section>
  );
}
