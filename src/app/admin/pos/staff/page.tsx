import type { Metadata } from "next";
import Link from "next/link";
import { rub } from "@/lib/format";
import { staffReport } from "@/lib/pos-staff";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { staffPercentAction } from "./actions";

export const metadata: Metadata = { title: "Продажи сотрудников" };
export const dynamic = "force-dynamic";

/** Выручка кассы по сотрудникам за месяц и процент с продаж */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireAdmin("MONEY");
  const [{ range, rows }, settings] = await Promise.all([staffReport((await searchParams).m ?? ""), getSettings()]);
  const pct = settings.finance.staffPercent;
  const t = rows.reduce((a, r) => ({ checks: a.checks + r.checks, net: a.net + r.net, gifts: a.gifts + r.gifts, returned: a.returned + r.returned }), { checks: 0, net: 0, gifts: 0, returned: 0 });
  const pay = (net: number) => Math.round((Math.max(0, net) * pct) / 100);

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Продажи сотрудников</h1>
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
        {pct > 0 && (
          <div className="stat">
            <div className="muted small">Сотрудникам {String(pct).replace(".", ",")} %</div>
            <div className="stat__value">{rub(pay(t.net))}</div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="muted">В этом месяце продаж в кассе не было.</p>
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
                {pct > 0 && <th style={{ textAlign: "right" }}>{String(pct).replace(".", ",")} %</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <b>{r.name}</b>
                    {r.account && <div className="muted small">телефон кассы: {r.account}</div>}
                    {r.clubs.length > 0 && <div className="muted small">{r.clubs.join("; ")}</div>}
                    {r.gifts > 0 && <div className="small">🎁 сертификаты: {rub(r.gifts)}</div>}
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
                  {pct > 0 && (
                    <td style={{ textAlign: "right" }}>
                      <b>{rub(pay(r.net))}</b>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {me.role === "OWNER" && (
        <form action={staffPercentAction} className="panel row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ margin: 0 }}>
            Процент сотруднику с продаж, %
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
