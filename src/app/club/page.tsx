import Link from "next/link";
import { clubQueue, requireClubStaff } from "@/lib/club-staff";
import { fmtDate, fmtDateTime, prettyPhone, rub } from "@/lib/format";
import { estimate, SERVICE_STATUS, type ServiceRow } from "@/lib/service";
import { getSettings } from "@/lib/settings";
import { ClubButton } from "./ClubButton";

type Props = { searchParams: Promise<{ c?: string; q?: string }> };

export default async function ClubPage({ searchParams }: Props) {
  const [{ clubs, admin }, { c, q }, settings] = await Promise.all([requireClubStaff(), searchParams, getSettings()]);
  if (!clubs.length) {
    return (
      <div className="panel">
        <h1 className="h3">Клуб не найден</h1>
        <p className="muted">{admin ? "Добавьте клубы в Админка → Клубы." : "Ваш клуб выключен или удалён. Обратитесь к владельцу магазина."}</p>
      </div>
    );
  }
  const club = clubs.find((x) => x.id === c) ?? clubs[0];
  const all = await clubQueue(club);

  // Поиск по номеру заказа или заявки, имени, последним цифрам телефона
  const needle = q?.trim().toLowerCase() ?? "";
  const digits = needle.replace(/\D/g, "");
  const hit = (x: { number: string; customerName?: string; name?: string; phone: string }) =>
    !needle ||
    x.number.toLowerCase().includes(needle) ||
    (x.customerName ?? x.name ?? "").toLowerCase().includes(needle) ||
    (digits.length >= 4 && x.phone.replace(/\D/g, "").endsWith(digits));
  const f = {
    waiting: all.waiting.filter(hit),
    coming: all.coming.filter(hit),
    given: all.given.filter((o) => hit(o)),
    bring: all.bring.filter(hit),
    ready: all.ready.filter(hit),
    atMaster: all.atMaster.filter(hit),
    serviceDone: all.serviceDone.filter(hit),
  };
  const days = settings.delivery.pickupStorageDays;
  const until = (d: Date | null) => (d ? new Date(d.getTime() + days * 86400_000) : null);
  const now = new Date();

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 10 }}>
        <h1 className="h2" style={{ margin: 0 }}>
          {club.name}
        </h1>
        <div className="muted">
          {club.city}, {club.address}
        </div>
        {clubs.length > 1 && (
          <nav className="cchips" aria-label="Клубы">
            {clubs.map((x) => (
              <Link key={x.id} href={`/club?c=${x.id}`} className="vchip" aria-current={x.id === club.id ? "true" : undefined}>
                {x.name} <span className="muted">{x.city}</span>
              </Link>
            ))}
          </nav>
        )}
        <form className="row" style={{ gap: 8 }} action="/club">
          <input type="hidden" name="c" value={club.id} />
          <input className="input" name="q" defaultValue={q ?? ""} placeholder="Номер заказа, имя или 4 последние цифры телефона" style={{ maxWidth: 440 }} />
          <button className="btn btn--line btn--sm">Найти</button>
          {needle && (
            <Link href={`/club?c=${club.id}`} className="small">
              Сбросить
            </Link>
          )}
        </form>
      </div>

      <div className="club-stats">
        <Stat n={f.waiting.length} label="ждут выдачи" />
        <Stat n={f.coming.length} label="едут в клуб" />
        <Stat n={f.bring.length} label="принесут кий" />
        <Stat n={f.ready.length} label="кий готов к выдаче" />
      </div>

      <Section title="Ждут выдачи" hint="Покупатель называет номер заказа — сверьте имя и выдайте. Заказы уже оплачены онлайн, деньги не берите.">
        {f.waiting.map((o) => {
          const u = until(o.shippedAt);
          const late = u && u < now;
          return (
            <article key={o.id} className={`club-card${late ? " club-card--late" : ""}`}>
              <OrderHead number={o.number} name={o.customerName} phone={o.phone} />
              <Items items={o.items} />
              <div className="small muted">
                В клубе с {o.shippedAt ? fmtDateTime(o.shippedAt) : "—"}
                {u && <span className={late ? "club-late" : ""}> · хранить до {fmtDate(u)}{late ? " — срок вышел, позвоните покупателю" : ""}</span>}
              </div>
              <ClubButton op="given" id={o.id} label="Выдан покупателю" confirmText={`Выдать заказ ${o.number} покупателю ${o.customerName}?`} />
            </article>
          );
        })}
      </Section>

      <Section title="Едут в клуб" hint="Оплаченные заказы с самовывозом из вашего клуба. Когда заказ привезли — нажмите «Пришёл в клуб»: покупателю придёт письмо «Можно забирать».">
        {f.coming.map((o) => (
          <article key={o.id} className="club-card">
            <OrderHead number={o.number} name={o.customerName} phone={o.phone} />
            <Items items={o.items} />
            <div className="small muted">
              Оплачен {o.paidAt ? fmtDateTime(o.paidAt) : "—"}
              {o.items.some((i) => i.spec) ? " · кий на заказ, делается в мастерской" : ""}
            </div>
            <ClubButton op="arrived" id={o.id} label="Пришёл в клуб" confirmText={`Заказ ${o.number} в клубе? Покупателю сразу придёт сообщение, что можно забирать.`} />
          </article>
        ))}
      </Section>

      <Section title="Мастерская: принесут кий" hint="Клиент назовёт номер заявки. Примите кий, проверьте, что работы совпадают, и нажмите «Кий принят».">
        {f.bring.map((r) => (
          <article key={r.id} className="club-card">
            <OrderHead number={r.number} name={r.name} phone={r.phone} />
            <ServiceInfo r={r} />
            <ClubButton op="svc-received" id={r.id} label="Кий принят" confirmText={`Принять кий по заявке ${r.number}?`} />
          </article>
        ))}
      </Section>

      <Section title="Мастерская: кий готов, выдать" hint="Если работы не оплачены онлайн — примите оплату на месте, нажмите «Оплачено на месте», затем «Выдан».">
        {f.ready.map((r) => (
          <article key={r.id} className="club-card">
            <OrderHead number={r.number} name={r.name} phone={r.phone} />
            <ServiceInfo r={r} />
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {r.price && !r.paidAt ? (
                <ClubButton op="svc-paid" id={r.id} label={`Оплачено на месте · ${rub(r.price)}`} primary={false} confirmText={`Клиент оплатил ${rub(r.price)} по заявке ${r.number}?`} />
              ) : null}
              <ClubButton op="svc-given" id={r.id} label="Кий выдан" confirmText={`Выдать кий по заявке ${r.number} клиенту ${r.name}?`} />
            </div>
          </article>
        ))}
      </Section>

      {f.atMaster.length > 0 && (
        <Section title="У мастера" hint="Для справки: кии этого клуба в работе. Когда будет готов — придёт уведомление.">
          {f.atMaster.map((r) => (
            <article key={r.id} className="club-card club-card--quiet">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{r.number}</b>
                <span className="pill pill--warn">{SERVICE_STATUS[r.status].text}</span>
              </div>
              <div className="small muted">
                {r.items.map((i) => i.name).join(", ")}
                {r.readyBy ? ` · готов к ${fmtDate(r.readyBy)}` : ""}
              </div>
            </article>
          ))}
        </Section>
      )}

      {(f.given.length > 0 || f.serviceDone.length > 0) && (
        <Section title="Выдано за неделю">
          {[...f.given.map((o) => ({ id: o.id, number: o.number, at: o.deliveredAt, what: `${o.items.length} поз.` })), ...f.serviceDone.map((r) => ({ id: r.id, number: r.number, at: r.updatedAt, what: "кий из мастерской" }))]
            .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
            .map((x) => (
              <div key={x.id} className="row-line small">
                <span>
                  <b>{x.number}</b> <span className="muted">· {x.what}</span>
                </span>
                <span className="muted">{x.at ? fmtDateTime(x.at) : ""}</span>
              </div>
            ))}
        </Section>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className={`club-stat${n ? " is-on" : ""}`}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <section className="stack" style={{ gap: 12 }}>
      <h2 className="h3" style={{ margin: 0 }}>
        {title} {list.length > 0 && <span className="muted">· {list.length}</span>}
      </h2>
      {hint && <p className="small muted" style={{ margin: 0 }}>{hint}</p>}
      {list.length ? <div className="club-grid">{list}</div> : <p className="muted small" style={{ margin: 0 }}>Пусто.</p>}
    </section>
  );
}

function OrderHead({ number, name, phone }: { number: string; name: string; phone: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <b className="club-card__num">{number}</b>
      <span>
        {name} · <a href={`tel:${phone}`}>{prettyPhone(phone)}</a>
      </span>
    </div>
  );
}

function Items({ items }: { items: { id: string; name: string; quantity: number }[] }) {
  return (
    <ul className="club-card__items">
      {items.map((i) => (
        <li key={i.id}>
          {i.name} <span className="muted">× {i.quantity}</span>
        </li>
      ))}
    </ul>
  );
}

function ServiceInfo({ r }: { r: Pick<ServiceRow, "items" | "description" | "price" | "paidAt" | "readyBy"> }) {
  const est = estimate(r);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <ul className="club-card__items">
        {r.items.map((i) => (
          <li key={i.name}>{i.name}</li>
        ))}
      </ul>
      {r.description && <div className="small muted">«{r.description.slice(0, 300)}»</div>}
      <div className="small">
        {r.price ? (
          <>
            Стоимость: <b>{rub(r.price)}</b> · {r.paidAt ? <span className="gold">оплачено</span> : <span className="club-late">не оплачено</span>}
          </>
        ) : (
          <span className="muted">Цену назовёт мастер{est ? ` (по прайсу от ${rub(est)})` : ""}</span>
        )}
      </div>
    </div>
  );
}
