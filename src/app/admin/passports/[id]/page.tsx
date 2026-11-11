import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { EVENT_ICON, passportEvents, passportUrl, warrantyUntil } from "@/lib/cue-passport";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { EventForm } from "../EventForm";
import { PassportForm } from "../PassportForm";
import { StatusButtons } from "../StatusButtons";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(d);

export default async function PassportAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await db.query.cuePassport.findFirst({ where: eq(s.cuePassport.id, String(id).slice(0, 64)) });
  if (!p) notFound();
  const [events, owner, order] = await Promise.all([
    passportEvents(p.id),
    p.ownerId ? db.query.user.findFirst({ where: eq(s.user.id, p.ownerId), columns: { id: true, name: true, email: true } }) : null,
    p.orderId ? db.query.order.findFirst({ where: eq(s.order.id, p.orderId), columns: { id: true, number: true } }) : null,
  ]);
  const url = passportUrl(p.code);

  return (
    <>
      <Link href="/admin/passports" className="small">
        ← Паспорта киёв
      </Link>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>
          Паспорт {p.serial} {p.status === "VOID" && <span className="pill pill--bad">аннулирован</span>}
        </h1>
        <a className="btn btn--line btn--sm" href={`/pasport/${p.code}`} target="_blank" rel="noreferrer">
          Открыть как покупатель
        </a>
      </div>
      {sp.created && <div className="form-ok">Паспорт выпущен. Выгравируйте номер {p.serial} на кие, наклейте QR и положите карточку в коробку.</div>}

      <section className="panel stack">
        <h2 className="h4" style={{ margin: 0 }}>
          Печать
        </h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn--gold btn--sm" href={`/print/passport/${p.id}?f=card`} target="_blank" rel="noreferrer">
            Карточка в коробку (100×150 мм)
          </a>
          <a className="btn btn--line btn--sm" href={`/print/passport/${p.id}?f=sticker`} target="_blank" rel="noreferrer">
            Наклейка с QR (30×20 мм)
          </a>
          <a className="btn btn--line btn--sm" href={`/admin/passports/${p.id}/qr.png`}>
            QR картинкой — для NIIMBOT
          </a>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          На карточке — код владельца <b>{p.claimCode}</b>: только для покупателя. Ссылка паспорта: <code>{url}</code>
        </p>
      </section>

      <div className="grid-2">
        <section className="panel stack" style={{ gap: 6 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Владелец
          </h2>
          {owner ? (
            <div>
              <Link href={`/admin/customers/${owner.id}`}>{owner.name || owner.email}</Link>
            </div>
          ) : (
            <div className="muted">Не привязан — покупатель привяжет кий кодом с карточки</div>
          )}
          {order && (
            <div className="small">
              Из заказа <Link href={`/admin/orders/${order.id}`}>{order.number}</Link>
            </div>
          )}
          <div className="small muted">
            Гарантия: {p.warrantyMonths ? `до ${fmtDate(warrantyUntil(p))}` : "нет"} · паспорт открывали {num(p.scans)} раз
          </div>
          <StatusButtons id={p.id} active={p.status === "ACTIVE"} hasOwner={!!p.ownerId} />
        </section>
        <section className="panel stack">
          <h2 className="h4" style={{ margin: 0 }}>
            История кия
          </h2>
          <ol className="passport__history">
            {events.map((e) => (
              <li key={e.id}>
                <span aria-hidden>{EVENT_ICON[e.kind] ?? "•"}</span>
                <span>
                  {e.text}
                  <span className="muted small"> · {fmtDateTime(e.createdAt)}</span>
                </span>
              </li>
            ))}
          </ol>
          <EventForm id={p.id} />
        </section>
      </div>

      <h2 className="h4">Данные паспорта</h2>
      <PassportForm
        data={{ id: p.id, model: p.model, spec: p.spec ?? "", master: p.master ?? "", madeAt: ymd(p.madeAt), warrantyMonths: p.warrantyMonths, photo: p.photo ?? "" }}
      />
    </>
  );
}
