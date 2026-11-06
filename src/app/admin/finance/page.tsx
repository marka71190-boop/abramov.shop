import { and, desc, gte, lt } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { EXPENSE_CATEGORIES, financeReport, mskDate, periodRange } from "@/lib/finance";
import { num, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { DeleteExpense, ExpenseForm, FinanceSettingsForm } from "./FinanceForms";

export const metadata: Metadata = { title: "Финансы" };
export const dynamic = "force-dynamic";

const PERIODS = [
  ["today", "Сегодня"],
  ["yesterday", "Вчера"],
  ["week", "7 дней"],
  ["month", "Этот месяц"],
  ["prev-month", "Прошлый месяц"],
  ["year", "Год"],
] as const;

const pctOf = (a: number, b: number) => (b > 0 ? `${String(Math.round((a / b) * 1000) / 10).replace(".", ",").replace("-", "−")} %` : "—");
/** Деньги со знаком: минус — настоящий «−», а не дефис */
const money = (k: number) => (k < 0 ? `−${rub(-k)}` : rub(k));

function Row({ label, value, sub, strong, minus, hint }: { label: React.ReactNode; value: number; sub?: boolean; strong?: boolean; minus?: boolean; hint?: React.ReactNode }) {
  return (
    <tr className={strong ? "pnl__total" : sub ? "pnl__sub" : undefined}>
      <td>
        {label}
        {hint && <div className="muted small">{hint}</div>}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className={strong && value < 0 ? "is-loss" : undefined}>
        {minus && value > 0 ? `− ${rub(value)}` : money(value)}
      </td>
    </tr>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requireAdmin("OWNER");
  const sp = await searchParams;
  const period = periodRange(sp.p ?? "month", sp.from, sp.to);
  const [r, settings, expenses] = await Promise.all([
    financeReport(period.from, period.to),
    getSettings(),
    db
      .select()
      .from(s.expense)
      .where(and(gte(s.expense.day, period.fromDay), lt(s.expense.day, mskDate(period.to))))
      .orderBy(desc(s.expense.day), desc(s.expense.createdAt))
      .limit(300),
  ]);
  const cats = [...new Set([...EXPENSE_CATEGORIES, ...r.expenses.byCategory.map((c) => c.category)])];

  return (
    <>
      <h1>Финансы</h1>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {PERIODS.map(([k, label]) => (
          <Link key={k} href={`/admin/finance?p=${k}`} className={`btn btn--sm ${period.key === k ? "btn--gold" : "btn--line"}`}>
            {label}
          </Link>
        ))}
      </div>
      <form className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <input type="hidden" name="p" value="custom" />
        <label className="field" style={{ margin: 0 }}>
          С
          <input className="input" type="date" name="from" defaultValue={period.fromDay} />
        </label>
        <label className="field" style={{ margin: 0 }}>
          По
          <input className="input" type="date" name="to" defaultValue={period.toDay} />
        </label>
        <button className={`btn btn--sm ${period.key === "custom" ? "btn--gold" : "btn--line"}`}>Показать</button>
      </form>

      <div className="stats">
        <div className="stat">
          <div className="muted small">Выручка · {period.label}</div>
          <div className="stat__value">{rub(r.revenue)}</div>
          <div className="muted small">
            заказов на сайте: {num(r.site.orders)} · чеков в кассе: {num(r.pos.sales)}
            {r.service.count ? ` · мастерская: ${num(r.service.count)}` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="muted small">Валовая прибыль</div>
          <div className={`stat__value${r.gross < 0 ? " is-loss" : ""}`}>{money(r.gross)}</div>
          <div className="muted small">маржа {pctOf(r.gross, r.revenue)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Чистая прибыль</div>
          <div className={`stat__value${r.net < 0 ? " is-loss" : ""}`}>{money(r.net)}</div>
          <div className="muted small">рентабельность {pctOf(r.net, r.revenue)}</div>
        </div>
      </div>

      {(r.missingCost > 0 || r.customCues > 0) && (
        <p className="small" style={{ margin: 0 }}>
          {r.missingCost > 0 && (
            <>
              <span className="pill pill--warn">Без закупочной цены: {num(r.missingCost)} поз.</span> — их себестоимость посчитана как 0, прибыль завышена. Впишите закупку в{" "}
              <Link href="/admin/catalog/prices">таблице цен</Link> — отчёт пересчитается.{" "}
            </>
          )}
          {r.customCues > 0 && <span className="muted">Кии на заказ ({num(r.customCues)}): работу мастера внесите расходом.</span>}
        </p>
      )}

      <div className="finance-grid">
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Отчёт о прибыли
          </h2>
          <div className="table-wrap">
            <table className="table pnl">
              <tbody>
                <Row label="Выручка" value={r.revenue} strong />
                <Row
                  label="Сайт — розница"
                  value={r.site.revenue - r.site.invoiceRevenue}
                  sub
                  hint={r.site.refunds ? `с учётом возвратов −${rub(r.site.refunds)}` : "с доставкой, которую оплатили покупатели"}
                />
                {r.site.invoiceOrders > 0 && <Row label={`Опт по счёту (${num(r.site.invoiceOrders)})`} value={r.site.invoiceRevenue} sub />}
                <Row
                  label="Касса"
                  value={r.pos.revenue}
                  sub
                  hint={r.pos.revenue ? `наличные ${rub(r.pos.cash)} · СБП ${rub(r.pos.sbp)} · карта ${rub(r.pos.card)}` : undefined}
                />
                {r.service.revenue > 0 && <Row label="Мастерская" value={r.service.revenue} sub />}
                <Row label="Себестоимость проданного" value={r.cogs} minus hint="по закупочным ценам" />
                <Row label="Валовая прибыль" value={r.gross} strong />
                <Row label="Комиссии ЮKassa и Робокассы" value={r.fees} minus />
                <Row label="Доставка СДЭК" value={r.site.delivery} minus hint="тариф без наценки, в том числе бесплатная для покупателя" />
                {r.losses > 0 && <Row label="Списания и недостачи" value={r.losses} minus hint={<Link href="/admin/stock/history?t=WRITE_OFF">журнал</Link>} />}
                {r.expenses.byCategory.map((c) => (
                  <Row key={c.category} label={c.category} value={c.amount} minus />
                ))}
                {r.tax > 0 && <Row label={`Налог ${String(r.taxPercent).replace(".", ",")} %`} value={r.tax} minus />}
                <Row label="Чистая прибыль" value={r.net} strong />
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Считаем по дате оплаты. Подарочные сертификаты — выручка в момент, когда ими оплатили заказ. Это управленческий отчёт для вас, не налоговая отчётность.
          </p>
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Что принесло больше всего
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style={{ textAlign: "right" }}>Шт</th>
                  <th style={{ textAlign: "right" }}>Выручка</th>
                  <th style={{ textAlign: "right" }}>Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {r.top.map((t) => (
                  <tr key={t.name}>
                    <td className="small">{t.name}</td>
                    <td style={{ textAlign: "right" }}>{num(t.qty)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(t.revenue)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {t.cost == null ? (
                        <span className="muted small" title="Нет закупочной цены">
                          нет закупки
                        </span>
                      ) : (
                        <>
                          {money(t.revenue - t.cost)}
                          <div className="muted small">{pctOf(t.revenue - t.cost, t.revenue)}</div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!r.top.length && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Продаж за этот период нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            По ценам товаров, без скидок на весь заказ.
          </p>
        </section>
      </div>

      <section className="stack" style={{ gap: 12 }} id="expenses">
        <h2 className="h4" style={{ margin: 0 }}>
          Расходы
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          Реклама, аренда, зарплата, налоги — всё, что не товар. Закупку товара проводите <Link href="/admin/stock/move?t=RECEIPT">приходом на складе</Link>: она станет себестоимостью
          проданного.
        </p>
        <div className="panel" style={{ padding: 16 }}>
          <ExpenseForm categories={cats} today={mskDate()} />
        </div>
        {expenses.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Категория</th>
                  <th>Комментарий</th>
                  <th style={{ textAlign: "right" }}>Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{e.day.split("-").reverse().join(".")}</td>
                    <td>{e.category}</td>
                    <td className="small muted">{e.note}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(e.amount)}</td>
                    <td style={{ textAlign: "right" }}>
                      <DeleteExpense id={e.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 12 }} id="finance-settings">
        <h2 className="h4" style={{ margin: 0 }}>
          Настройки расчёта
        </h2>
        <div className="panel" style={{ padding: 16 }}>
          <FinanceSettingsForm v={settings.finance} />
        </div>
      </section>
    </>
  );
}
