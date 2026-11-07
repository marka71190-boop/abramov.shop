import Link from "next/link";
import { notFound } from "next/navigation";
import { CountSheet } from "@/components/pos/CountSheet";
import { COUNT_STATUS, getCount } from "@/lib/stock-count";
import { variantOptions } from "@/lib/stock-moves";
import { requireCashier } from "@/lib/viewer";

export const metadata = { title: "Ревизия" };

/** Лист ревизии на телефоне кассы: остатки по учёту не показываем — считаем честно */
export default async function KassaCountSheet({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await requireCashier();
  const c = await getCount((await params).id);
  if (!c || c.createdById !== me.id) notFound();
  const draft = c.status === "DRAFT";
  // Без остатков и закупочных цен — кассиру они не нужны
  const options = draft ? (await variantOptions(c.clubId)).map((o) => ({ ...o, stock: 0, cost: null })) : [];
  return (
    <>
      <Link href="/kassa/count" className="muted small">
        ← Ревизии
      </Link>
      <h1 style={{ margin: 0 }}>Ревизия · {c.clubTitle}</h1>
      <p className="muted small" style={{ margin: 0 }}>
        {COUNT_STATUS[c.status]}
        {c.staffName ? ` · считает ${c.staffName}` : ""}
      </p>
      {draft ? (
        <CountSheet id={c.id} options={options} initial={c.counts} blind canSubmit backHref="/kassa/count" />
      ) : (
        <div className={c.status === "CANCELLED" ? "notice notice--muted" : "form-ok"}>
          {c.status === "SUBMITTED"
            ? `Отправлено менеджеру: ${Object.values(c.counts).reduce((a, x) => a + x, 0)} шт. Он сверит с учётом и проведёт.`
            : c.status === "APPLIED"
              ? "Менеджер провёл ревизию."
              : "Ревизия отменена."}
        </div>
      )}
    </>
  );
}
