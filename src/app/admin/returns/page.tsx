import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { RETURN_KIND, RETURN_RESOLUTION, RETURN_STATUS } from "@/lib/returns";
import { requireAdmin } from "@/lib/viewer";

const TABS = [
  { key: "open", label: "В работе", statuses: ["NEW", "APPROVED", "RECEIVED"] },
  { key: "done", label: "Закрытые", statuses: ["COMPLETED", "REJECTED", "CANCELLED"] },
] as const;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const { tab = "open" } = await searchParams;
  const t = TABS.find((x) => x.key === tab) ?? TABS[0];
  const rows = await db.query.returnRequest.findMany({
    where: inArray(s.returnRequest.status, [...t.statuses]),
    orderBy: t.key === "open" ? (r, { asc }) => asc(r.decisionDue) : desc(s.returnRequest.updatedAt),
    limit: 200,
    with: { order: { columns: { number: true, customerName: true } }, items: { with: { orderItem: { columns: { name: true } } } } },
  });
  const now = Date.now();

  return (
    <>
      <h1>Возвраты и обмены</h1>
      <nav className="tabs">
        {TABS.map((x) => (
          <Link key={x.key} href={`/admin/returns?tab=${x.key}`} aria-current={x.key === t.key ? "page" : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="muted">{t.key === "open" ? "Новых заявок нет." : "Закрытых заявок пока нет."}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Покупатель</th>
                <th>Что</th>
                <th>Статус</th>
                <th>{t.key === "open" ? "Ответить до" : "Обновлена"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const due = +r.decisionDue - now;
                const late = r.status === "NEW" && due < 0;
                const soon = r.status === "NEW" && due >= 0 && due < 2 * 86400_000;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/returns/${r.id}`} style={{ fontWeight: 600 }}>
                        {r.number}
                      </Link>
                      <div className="muted small">заказ {r.order.number}</div>
                    </td>
                    <td className="small">{r.order.customerName}</td>
                    <td className="small">
                      {r.items.map((i) => `${i.orderItem.name} × ${i.quantity}`).join(", ")}
                      <div className="muted">
                        {RETURN_KIND[r.kind]}
                        {r.kind === "DEFECT" ? ` · ${RETURN_RESOLUTION[r.resolution]}` : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${TONE_PILL[RETURN_STATUS[r.status].tone]}`}>{RETURN_STATUS[r.status].text}</span>
                    </td>
                    <td className="small" style={{ color: late ? "var(--c-danger)" : soon ? "var(--c-gold)" : undefined }}>
                      {t.key === "open" ? (r.status === "NEW" ? `${fmtDate(r.decisionDue)}${late ? " — просрочено" : ""}` : "решение принято") : fmtDateTime(r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
