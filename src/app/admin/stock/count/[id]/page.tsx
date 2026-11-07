import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountSheet } from "@/components/pos/CountSheet";
import { fmtDateTime, rub } from "@/lib/format";
import { COUNT_STATUS, countDiff, getCount } from "@/lib/stock-count";
import { variantOptions } from "@/lib/stock-moves";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = { title: "Ревизия" };
export const dynamic = "force-dynamic";

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ full?: string }> }) {
  const me = await requireAdmin();
  const c = await getCount((await params).id);
  if (!c) notFound();
  const sp = await searchParams;
  const full = sp.full ? sp.full === "1" : c.full;
  const open = c.status === "DRAFT" || c.status === "SUBMITTED";
  const mineDraft = c.status === "DRAFT" && c.createdById === me.id;
  const [options, diff] = await Promise.all([mineDraft ? variantOptions(c.clubId) : Promise.resolve([]), open ? countDiff({ ...c, full }) : Promise.resolve(null)]);
  const shown = diff?.lines.filter((l) => l.diff !== 0 || l.counted != null) ?? [];

  return (
    <>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock/count" className="btn btn--sm btn--line">
          ← Ревизии
        </Link>
      </div>
      <h1 style={{ marginBottom: 4 }}>Ревизия · {c.clubTitle}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {COUNT_STATUS[c.status]} · начали {fmtDateTime(c.createdAt)} · считал(а) {c.staffName ?? c.author}
        {c.note ? ` · «${c.note}»` : ""}
      </p>

      {mineDraft && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Считаем
          </h2>
          <CountSheet id={c.id} options={options} initial={c.counts} blind={false} canSubmit={false} backHref="/admin/stock/count" />
          <Link href={`/admin/stock/count/${c.id}`} className="btn btn--sm btn--line" style={{ alignSelf: "flex-start" }}>
            Обновить сверку
          </Link>
        </section>
      )}

      {c.status === "APPLIED" && c.result && (
        <div className="form-ok">
          Проведена {c.appliedAt ? fmtDateTime(c.appliedAt) : ""}: {c.result.lines} поз. изменено, недостача {c.result.minus} шт
          {c.result.minusCost ? ` (${rub(c.result.minusCost)} по закупке)` : ""}, излишки {c.result.plus} шт. Движения — в{" "}
          <Link href="/admin/stock/history">истории склада</Link>.
        </div>
      )}
      {c.status === "CANCELLED" && <div className="notice notice--muted">Ревизия отменена — остатки не менялись.</div>}

      {diff && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Сверка с учётом
          </h2>
          <div className="stats">
            <div className="stat">
              <div className="muted small">Насчитали</div>
              <div className="stat__value">{diff.counted} шт</div>
            </div>
            <div className="stat">
              <div className="muted small">Не хватает</div>
              <div className={`stat__value${diff.minusQty ? " is-loss" : ""}`}>{diff.minusQty} шт</div>
              {diff.minusCost > 0 && <div className="muted small">{rub(diff.minusCost)} по закупке</div>}
            </div>
            <div className="stat">
              <div className="muted small">Лишнее</div>
              <div className="stat__value">{diff.plusQty} шт</div>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="muted">Пока сверять нечего.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>По учёту</th>
                    <th>Насчитали</th>
                    <th>Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.variantId}>
                      <td>
                        {l.name}
                        {l.sku && <div className="muted small">{l.sku}</div>}
                      </td>
                      <td>{l.expected}</td>
                      <td>{l.counted ?? <span className="muted">{full ? "не нашли" : "не считали"}</span>}</td>
                      <td className={l.diff < 0 ? "is-loss" : undefined}>{l.diff > 0 ? `+${l.diff}` : l.diff || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ApplyForm id={c.id} full={full} readonly={isDirector(me)} />
        </section>
      )}
    </>
  );
}
