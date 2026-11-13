import type { Metadata } from "next";
import Link from "next/link";
import { fmtDate, rub } from "@/lib/format";
import { currentShift } from "@/lib/pos-shifts";
import { PAY_KIND, staffPayFor } from "@/lib/pos-staff";
import { getSettings } from "@/lib/settings";
import { requireCashier } from "@/lib/viewer";

export const metadata: Metadata = { title: "Моя зарплата" };
export const dynamic = "force-dynamic";

/** Зарплата кассира за месяц: что начислено и за что, что уже выплатили. Только своя */
export default async function KassaPayPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { me } = await requireCashier("/kassa/pay");
  const settings = await getSettings();
  const shift = await currentShift(me.id);
  // На общем телефоне кассы человек — тот, кто вписан в открытую смену
  const name = shift?.staffName || (me.isDevice ? null : me.name);
  const back = (
    <p className="small" style={{ margin: 0 }}>
      <Link href="/kassa">← Касса</Link>
    </p>
  );
  if (!settings.finance.staffPayVisible)
    return (
      <>
        {back}
        <h1>Моя зарплата</h1>
        <p className="muted">Зарплату здесь не показываем — спросите у руководителя.</p>
      </>
    );
  if (!name)
    return (
      <>
        {back}
        <h1>Моя зарплата</h1>
        <p className="muted">Откройте смену и впишите своё имя — покажем зарплату того, кто на смене.</p>
      </>
    );

  const { range, row } = await staffPayFor(name, (await searchParams).m ?? "");
  const pc = (v: number) => String(v).replace(".", ",");
  const lines = row
    ? [
        row.percent > 0 && { label: `${pc(row.percent)} % от выручки ${rub(Math.max(0, row.net))}`, value: row.percentPay },
        row.bonus > 0 && { label: "Премии", value: row.bonus },
        row.fine > 0 && { label: "Штрафы", value: -row.fine },
      ].filter((x): x is { label: string; value: number } => !!x)
    : [];

  return (
    <>
      {back}
      <h1 style={{ marginBottom: 0 }}>Моя зарплата</h1>
      <div className="muted">{name}</div>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <Link href={`/kassa/pay?m=${range.prev}`} className="btn btn--sm btn--line" aria-label="Предыдущий месяц">
          ←
        </Link>
        <b style={{ minWidth: 140, textAlign: "center" }}>{range.label}</b>
        <Link href={`/kassa/pay?m=${range.next}`} className="btn btn--sm btn--line" aria-label="Следующий месяц">
          →
        </Link>
      </div>
      {!row ? (
        <p className="muted">В этом месяце смен не было.</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="muted small">Начислено</div>
              <div className="stat__value">{rub(row.accrued)}</div>
            </div>
            <div className="stat">
              <div className="muted small">Выплачено</div>
              <div className="stat__value">{rub(row.paid)}</div>
            </div>
            <div className="stat">
              <div className="muted small">К выплате</div>
              <div className="stat__value">{rub(row.due)}</div>
            </div>
          </div>
          <div className="panel stack" style={{ gap: 8 }}>
            <b>За что начислено</b>
            {lines.length === 0 ? (
              <span className="muted">Процент пока не задан — его выставляет руководитель.</span>
            ) : (
              lines.map((l) => (
                <div key={l.label} className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <span>{l.label}</span>
                  <b className={l.value < 0 ? "is-loss" : undefined}>{rub(l.value)}</b>
                </div>
              ))
            )}
            <span className="muted small">
              Смен: {row.shifts} · часов: {pc(row.hours)} · чеков: {row.checks} · продано {rub(row.sold)}
              {row.returned ? ` · возвраты ${rub(row.returned)}` : ""}. Выручка — продажи товара после скидки минус возвраты.
            </span>
          </div>
          {row.pays.length > 0 && (
            <div className="panel stack" style={{ gap: 6 }}>
              <b>Выплаты, премии и штрафы</b>
              {row.pays.map((p) => (
                <div key={p.id} className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <span>
                    {fmtDate(p.at)} · {PAY_KIND[p.kind] ?? p.kind}
                    {p.note ? ` — ${p.note}` : ""}
                  </span>
                  <b>{rub(p.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
