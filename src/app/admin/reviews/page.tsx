import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Stars } from "@/components/product/Stars";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { ReviewModeration } from "./ReviewModeration";

const TABS = [
  { key: "PENDING", label: "На проверке" },
  { key: "APPROVED", label: "Опубликованы" },
  { key: "REJECTED", label: "Отклонены" },
] as const;

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "PENDING" } = await searchParams;
  const st = (TABS.find((t) => t.key === status)?.key ?? "PENDING") as (typeof TABS)[number]["key"];
  const [rows, pending] = await Promise.all([
    db.query.review.findMany({
      where: eq(s.review.status, st),
      orderBy: desc(s.review.createdAt),
      limit: 100,
      with: { user: { columns: { id: true, name: true, email: true } }, product: { columns: { name: true, slug: true } } },
    }),
    db.$count(s.review, eq(s.review.status, "PENDING")),
  ]);
  return (
    <>
      <h1>Отзывы</h1>
      <nav className="tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`?status=${t.key}`} aria-current={st === t.key ? "page" : undefined}>
            {t.label}
            {t.key === "PENDING" && pending ? ` · ${pending}` : ""}
          </Link>
        ))}
      </nav>
      {!rows.length && <p className="muted">Здесь пусто.</p>}
      {rows.map((r) => (
        <div key={r.id} className="panel stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 10 }}>
              <Stars value={r.rating} />
              <Link href={`/product/${r.product.slug}#reviews`} target="_blank">
                {r.product.name}
              </Link>
            </div>
            <span className="muted small">{fmtDateTime(r.createdAt)}</span>
          </div>
          <div className="muted small">
            <Link href={`/admin/customers/${r.user.id}`}>{r.user.name}</Link> · {r.user.email}
            {r.orderId ? " · подтверждённая покупка" : ""}
            {r.bonusCredited ? " · бонус начислен" : ""}
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.text}</p>
          {r.photos.length > 0 && (
            <div className="row">
              {r.photos.map((p) => (
                <a key={p} href={p} target="_blank" rel="noreferrer" className="review-thumb">
                  <img src={p} alt="" />
                </a>
              ))}
            </div>
          )}
          <ReviewModeration id={r.id} status={r.status} reply={r.adminReply} />
        </div>
      ))}
    </>
  );
}
