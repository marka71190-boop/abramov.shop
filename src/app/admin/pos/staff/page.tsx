import type { Metadata } from "next";
import Link from "next/link";
import { rub } from "@/lib/format";
import { staffReport } from "@/lib/pos-staff";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { staffPercentAction } from "./actions";
import { PayVisible, StaffPay } from "./StaffPay";

export const metadata: Metadata = { title: "Продажи и зарплата сотрудников" };
export const dynamic = "force-dynamic";

/** Выручка кассы по сотрудникам за месяц и зарплата: ставка за смену, за час, процент, премии, штрафы, выплаты */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireAdmin("MONEY");
  const [{ range, rows }, settings] = await Promise.all([staffReport((await searchParams).m ?? ""), getSettings()]);
  const pct = settings.finance.staffPercent;
  const t = rows.reduce((a, r) => ({ checks: a.checks + r.checks, net: a.net + r.net, gifts: a.gifts + r.gifts, returned: a.returned + r.returned }), { checks: 0, net: 0, gifts: 0, returned: 0 });
  const sum = rows.reduce((a, r) => ({ accrued: a.accrued + r.accrued, paid: a.paid + r.paid, due: a.due + r.due }), { accrued: 0, paid: 0, due: 0 });
  const owner = me.role === "OWNER";
  const pc = (v: number) => String(v).replace(".", ",");
  /** «2 000 ₽/смена · 150 ₽/час · 3 %» */
  const rateText = (r: (typeof rows)[number]) => [r.perShift && `${rub(r.perShift)}/смена`, r.perHour && `${rub(r.perHour)}/час`, r.percent > 0 && `${pc(r.percent)} %`].filter(Boolean).join(" · ");

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Продажи и зарплата сотрудников</h1>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/admin/pos/staff?m=${range.prev}`} className="btn btn--sm btn--line" aria-label="Предыдущий месяц">
          ←
        </Link>
        <b style={{ minWidth: 140, textAlign: "center" }}>{range.label}</b>
        <Link href={`/admin/pos/staff?m=${range.next}`} className="btn btn--sm btn--line" aria-label="Следующий месяц">
          →
        </Link>
        <Link href="/admin/pos" className="btn btn--sm btn--line">
          Касса
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="muted small">Продали товара</div>
          <div className="stat__value">{rub(t.net)}</div>
          <div className="muted small">{t.checks} чек. · возвраты {rub(t.returned)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Сертификаты</div>
          <div className="stat__value">{rub(t.gifts)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Начислено зарплаты</div>
          <div className="stat__value">{rub(sum.accrued)}</div>
          <div className="muted small">выплачено {rub(sum.paid)}</div>
        </div>
        <div className="stat">
          <div className="muted small">К выплате</div>
          <div className="stat__value">{rub(sum.due)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">В этом месяце смен и продаж в кассе не было.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th style={{ textAlign: "right" }}>Смен · часов</th>
                <th style={{ textAlign: "right" }}>Чеков</th>
                <th style={{ textAlign: "right" }}>Продал</th>
                <th style={{ textAlign: "right" }}>Возвраты</th>
                <th style={{ textAlign: "right" }}>Итого</th>
                <th style={{ textAlign: "right" }}>Средний чек</th>
                <th style={{ textAlign: "right" }}>Начислено</th>
                <th style={{ textAlign: "right" }}>Выплачено</th>
                <th style={{ textAlign: "right" }}>К выплате</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((r) => [
                <tr key={r.key}>
                  <td>
                    <b>{r.name}</b>
                    {r.account && <div className="muted small">телефон кассы: {r.account}</div>}
                    {r.clubs.length > 0 && <div className="muted small">{r.clubs.join("; ")}</div>}
                    {r.gifts > 0 && <div className="small">🎁 сертификаты: {rub(r.gifts)}</div>}
                    <div className="small">{rateText(r) ? `Ставка: ${rateText(r)}` : <span className="is-loss">ставка не задана</span>}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.shifts} · {String(r.hours).replace(".", ",")}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.checks}</td>
                  <td style={{ textAlign: "right" }}>{rub(r.sold)}</td>
                  <td style={{ textAlign: "right" }} className={r.returned ? "is-loss" : undefined}>
                    {r.returned ? `−${rub(r.returned)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <b>{rub(r.net)}</b>
                  </td>
                  <td style={{ textAlign: "right" }}>{r.checks ? rub(Math.round(r.sold / r.checks)) : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <b>{rub(r.accrued)}</b>
                    <div className="muted small">
                      {[r.shiftPay && `смены ${rub(r.shiftPay)}`, r.hourPay && `часы ${rub(r.hourPay)}`, r.percentPay && `% ${rub(r.percentPay)}`, r.bonus && `премии ${rub(r.bonus)}`, r.fine && `штрафы −${rub(r.fine)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{r.paid ? rub(r.paid) : "—"}</td>
                  <td style={{ textAlign: "right" }} className={r.due < 0 ? "is-loss" : undefined}>
                    <b>{rub(r.due)}</b>
                  </td>
                </tr>,
                <tr key={`${r.key}:pay`}>
                  <td colSpan={10} style={{ paddingTop: 0, borderTop: 0 }}>
                    <details>
                      <summary className="small">Ставка и выплаты{r.pays.length ? ` · записей: ${r.pays.length}` : ""}</summary>
                      <StaffPay key={`${r.key}:${range.key}`} row={{ name: r.name, perShift: r.perShift, perHour: r.perHour, percent: r.percent, ownPercent: r.ownPercent, due: r.due, pays: r.pays }} month={range.key} owner={owner} commonPercent={pct} />
                    </details>
                  </td>
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel stack" style={{ gap: 8 }}>
        <b>Как считается зарплата</b>
        <span className="small">
          Начислено = смены × ставка за смену + часы × ставка за час + процент с «Итого» + премии − штрафы. Ставку каждому задаёт владелец — в строке сотрудника,
          «Ставка и выплаты». Часы — от открытия до закрытия смены. Выплатили деньги — запишите выплату: «К выплате» уменьшится.
        </span>
        {owner && <PayVisible on={settings.finance.staffPayVisible} />}
      </div>

      {me.role === "OWNER" && (
        <form action={staffPercentAction} className="panel row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ margin: 0 }}>
            Общий процент с продаж, % — тем, кому не задан свой
            <input className="input" name="percent" inputMode="decimal" defaultValue={String(pct).replace(".", ",")} style={{ width: 100 }} />
          </label>
          <button className="btn btn--line btn--sm">Сохранить</button>
          <span className="muted small" style={{ flexBasis: "100%" }}>
            Считается от «Итого»: продажи товара после скидки минус возвраты. Сертификаты в процент не входят — их потом тратят на товар. 0 — не считать.
          </span>
        </form>
      )}
      <p className="muted small">
        Сотрудник — тот, кто был на смене (на общем телефоне кассы вписывают имя при открытии смены). Если имя писали по-разному, строки разделятся — пишите одинаково.
      </p>
    </>
  );
}
