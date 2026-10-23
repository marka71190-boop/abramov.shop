import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime, prettyPhone, rub } from "@/lib/format";
import { ORDER_STATUS, orderStatus, TONE_PILL, type OrderStatus } from "@/lib/order-status";

const PER_PAGE = 50;
type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

const TABS: { key: string; label: string }[] = [
  { key: "", label: "Все" },
  { key: "PAID", label: "Новые оплаченные" },
  { key: "ASSEMBLING", label: "Собираем" },
  { key: "SHIPPED", label: "В пути" },
  { key: "AWAITING_PAYMENT", label: "Ждут оплату" },
  { key: "DELIVERED", label: "Получены" },
  { key: "CANCELLED", label: "Отменены" },
  { key: "REFUNDED", label: "Возвраты" },
];

export default async function OrdersPage({ searchParams }: Props) {
  const { q = "", status = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const conds: SQL[] = [];
  const term = q.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, "")}%`;
    const digits = term.replace(/\D/g, "");
    conds.push(
      or(
        ilike(s.order.number, like),
        ilike(s.order.customerName, like),
        ilike(s.order.email, like),
        ilike(s.order.trackNumber, like),
        ...(digits.length >= 3 ? [ilike(s.order.phone, `%${digits.slice(-10)}%`)] : []),
      )!,
    );
  }
  if (status && status in ORDER_STATUS) conds.push(eq(s.order.status, status as OrderStatus));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total, paidCount, toPack] = await Promise.all([
    db.query.order.findMany({ where, orderBy: desc(s.order.createdAt), limit: PER_PAGE, offset: (pageNum - 1) * PER_PAGE, with: { items: { columns: { quantity: true } } } }),
    db.$count(s.order, where),
    db.$count(s.order, eq(s.order.status, "PAID")),
    // Всё, что нужно собрать: оплачено или уже собирается
    db.select({ id: s.order.id }).from(s.order).where(inArray(s.order.status, ["PAID", "ASSEMBLING"])).orderBy(desc(s.order.paidAt)).limit(100),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (p: Record<string, string>) => `?${new URLSearchParams({ q, status, page: "1", ...p })}`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Заказы</h1>
        {toPack.length > 0 && (
          <a className="btn btn--line btn--sm" href={`/print/orders?ids=${toPack.map((r) => r.id).join(",")}&doc=all`} target="_blank" rel="noreferrer">
            Распечатать к отправке · {toPack.length}
          </a>
        )}
      </div>
      <nav className="tabs" aria-label="Статус">
        {TABS.map((t) => (
          <Link key={t.key} href={qs({ status: t.key })} aria-current={status === t.key ? "page" : undefined}>
            {t.label}
            {t.key === "PAID" && paidCount > 0 ? ` · ${paidCount}` : ""}
          </Link>
        ))}
      </nav>
      <form className="toolbar">
        <input type="hidden" name="status" value={status} />
        <label className="field" style={{ flex: "1 1 280px" }}>
          Поиск: номер, имя, телефон, почта, трек
          <input className="input" name="q" defaultValue={q} />
        </label>
        <button className="btn btn--line btn--sm">Найти</button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Клиент</th>
              <th>Доставка</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const st = orderStatus(o.status, o.deliveryType);
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} style={{ fontWeight: 600 }}>
                      {o.number}
                    </Link>
                    <div className="muted small">
                      {fmtDateTime(o.createdAt)} · {o.items.reduce((a, i) => a + i.quantity, 0)} шт.
                    </div>
                  </td>
                  <td>
                    {o.customerName}
                    <div className="muted small">{prettyPhone(o.phone)}</div>
                  </td>
                  <td>
                    {o.city}
                    <div className="muted small">
                      {o.deliveryType === "COURIER" ? "Курьер" : o.deliveryType === "PICKUP" ? "Самовывоз" : "ПВЗ"}
                      {o.trackNumber ? ` · ${o.trackNumber}` : ""}
                    </div>
                  </td>
                  <td>{rub(o.total)}</td>
                  <td>
                    <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>
                    {o.paymentMethod === "INVOICE" && <div className="muted small">по счёту</div>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Заказов не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          {pageNum > 1 && <Link href={qs({ page: String(pageNum - 1) })}>← Назад</Link>}
          <span>
            Страница {pageNum} из {pages}
          </span>
          {pageNum < pages && <Link href={qs({ page: String(pageNum + 1) })}>Дальше →</Link>}
        </div>
      )}
    </>
  );
}
