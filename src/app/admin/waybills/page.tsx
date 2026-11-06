import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { cdekEnabled } from "@/lib/cdek";
import { tinRule } from "@/lib/countries";
import { fmtDate, rub } from "@/lib/format";
import { orderStatus, TONE_PILL } from "@/lib/order-status";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { CheckAll, CreateShipments } from "./Forms";

export const metadata = { title: "Накладные" };

type Props = { searchParams: Promise<{ tab?: string }> };

/**
 * Накладные: СДЭК — создать отправления и распечатать накладные и штрихкоды пачкой;
 * Почта России — инвойс для таможни по заказам за рубеж, которые идут почтой.
 */
export default async function Waybills({ searchParams }: Props) {
  const me = await requireAdmin();
  const readonly = isDirector(me);
  const { tab = "cdek" } = await searchParams;
  const post = tab === "post";
  const since = new Date(Date.now() - 30 * 86400_000);
  const cdek = cdekEnabled();

  const [toCreate, toPrint, mail] = await Promise.all([
    post
      ? Promise.resolve([])
      : db.query.order.findMany({
          where: and(inArray(s.order.status, ["PAID", "ASSEMBLING"]), inArray(s.order.deliveryType, ["PVZ", "COURIER"]), isNull(s.order.cdekOrderUuid)),
          orderBy: desc(s.order.paidAt),
          limit: 100,
        }),
    post
      ? Promise.resolve([])
      : db.query.order.findMany({
          where: and(isNotNull(s.order.cdekOrderUuid), or(inArray(s.order.status, ["PAID", "ASSEMBLING"]), and(eq(s.order.status, "SHIPPED"), gte(s.order.shippedAt, since)))),
          orderBy: desc(s.order.createdAt),
          limit: 100,
        }),
    post
      ? db.query.order.findMany({
          where: and(eq(s.order.deliveryType, "MANUAL"), ne(s.order.status, "CANCELLED"), ne(s.order.status, "AWAITING_PAYMENT"), gte(s.order.createdAt, new Date(Date.now() - 90 * 86400_000))),
          orderBy: desc(s.order.createdAt),
          limit: 100,
        })
      : Promise.resolve([]),
  ]);

  const place = (o: (typeof toPrint)[number]) => (
    <>
      {o.country !== "RU" && <span title="За рубеж">🌍 </span>}
      {o.city}
      <div className="muted small">{o.deliveryType === "COURIER" ? "Курьер" : o.deliveryType === "MANUAL" ? "Почта России" : "ПВЗ"}</div>
    </>
  );
  const status = (o: (typeof toPrint)[number]) => {
    const st = orderStatus(o.status, o.deliveryType);
    return <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>;
  };

  return (
    <>
      <h1>Накладные</h1>
      <nav className="tabs" aria-label="Перевозчик">
        <Link href="/admin/waybills" aria-current={!post ? "page" : undefined}>
          СДЭК
        </Link>
        <Link href="/admin/waybills?tab=post" aria-current={post ? "page" : undefined}>
          Почта России — за рубеж
        </Link>
      </nav>

      {!post && !cdek && <div className="notice notice--muted">СДЭК не подключён — накладные печатаются в личном кабинете СДЭК.</div>}

      {!post && (
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Оплачены — отправление ещё не создано</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Отметьте заказы и создайте отправления — СДЭК присвоит трек-номера, заказы перейдут в «Собирается». Потом их накладные появятся ниже.
          </p>
          {toCreate.length ? (
            <CreateShipments disabled={readonly || !cdek}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <CheckAll form="wb-create" />
                      </th>
                      <th>Заказ</th>
                      <th>Куда</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toCreate.map((o) => {
                      const noTin = tinRule(o.country) && !o.recipientTin;
                      return (
                        <tr key={o.id}>
                          <td>
                            <input type="checkbox" name="id" value={o.id} aria-label={o.number} disabled={!o.cdekCityCode} />
                          </td>
                          <td>
                            <Link href={`/admin/orders/${o.id}`}>{o.number}</Link>
                            <div className="muted small">оплачен {o.paidAt ? fmtDate(o.paidAt) : "—"}</div>
                          </td>
                          <td>
                            {place(o)}
                            {!o.cdekCityCode && <div className="small is-loss">нет кода города СДЭК — создайте в кабинете СДЭК</div>}
                            {noTin && <div className="small is-loss">нет {tinRule(o.country)!.label} получателя</div>}
                          </td>
                          <td>{rub(o.total)}</td>
                          <td>{status(o)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CreateShipments>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Все оплаченные заказы уже переданы в СДЭК.
            </p>
          )}
        </div>
      )}

      {!post && (
        <form className="panel stack" id="wb-print" action="/admin/waybills/pdf" method="get" target="_blank">
          <h2 style={{ marginBottom: 0 }}>Печать накладных и штрихкодов</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Отправления в работе и отправленные за 30 дней. Накладная — в двух экземплярах на А4 (один курьеру или в пункт, второй себе). Штрихкод — наклейка
            на посылку.
          </p>
          {toPrint.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <CheckAll form="wb-print" />
                      </th>
                      <th>Заказ</th>
                      <th>Куда</th>
                      <th>Трек СДЭК</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toPrint.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <input type="checkbox" name="id" value={o.id} aria-label={o.number} defaultChecked={o.status !== "SHIPPED"} />
                        </td>
                        <td>
                          <Link href={`/admin/orders/${o.id}`}>{o.number}</Link>
                        </td>
                        <td>{place(o)}</td>
                        <td>
                          {o.trackNumber ?? <span className="muted">присваивается</span>}
                          {o.cdekStatus && <div className="muted small">{o.cdekStatus}</div>}
                        </td>
                        <td>{status(o)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn--gold btn--sm" name="kind" value="waybill" disabled={!cdek}>
                  Накладные (PDF)
                </button>
                <button className="btn btn--line btn--sm" name="kind" value="barcode" disabled={!cdek}>
                  Штрихкоды (PDF)
                </button>
                <label className="row small" style={{ gap: 6, alignItems: "center" }}>
                  формат наклейки
                  <select className="input" name="format" defaultValue="A6" style={{ minHeight: 36, width: "auto", padding: "0 10px" }}>
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="A6">A6 — 105×148</option>
                    <option value="A7">A7 — 74×105</option>
                  </select>
                </label>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                PDF готовит СДЭК — обычно 3–10 секунд, файл откроется в новой вкладке.
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Отправлений пока нет.
            </p>
          )}
        </form>
      )}

      {post && (
        <form className="panel stack" id="wb-post" action="/print/customs" method="get" target="_blank">
          <h2 style={{ marginBottom: 0 }}>Инвойс для таможни — Почта России</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Заказы за рубеж в страны, куда не возит СДЭК, — оплаченные, за 90 дней. В инвойсе по-английски и по-русски: товары, коды ТН ВЭД, страна производства, вес и
            стоимость — всё, что нужно для таможенной декларации CN 23 на почте. Название по-английски, код и страну заполните в карточке товара → «Для таможни». Трек
            Почты впишите в заказе — покупателю придёт ссылка на отслеживание на pochta.ru.
          </p>
          {mail.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <CheckAll form="wb-post" />
                      </th>
                      <th>Заказ</th>
                      <th>Куда</th>
                      <th>Сумма</th>
                      <th>Трек</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mail.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <input type="checkbox" name="ids" value={o.id} aria-label={o.number} defaultChecked={o.status === "PAID" || o.status === "ASSEMBLING"} />
                        </td>
                        <td>
                          <Link href={`/admin/orders/${o.id}`}>{o.number}</Link>
                        </td>
                        <td>
                          🌍 {o.countryName ?? o.country}, {o.city}
                        </td>
                        <td>{rub(o.total)}</td>
                        <td>{o.trackNumber ?? <span className="muted">—</span>}</td>
                        <td>{status(o)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn--gold btn--sm">Инвойс для таможни</button>
                <label className="row small" style={{ gap: 6, alignItems: "center" }}>
                  экземпляров
                  <select className="input" name="copies" defaultValue="1" style={{ minHeight: 36, width: "auto", padding: "0 10px" }}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Оплаченных заказов за рубеж через Почту России пока нет.
            </p>
          )}
        </form>
      )}
    </>
  );
}
