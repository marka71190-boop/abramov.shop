import Link from "next/link";
import { num } from "@/lib/format";
import { lowStockThreshold, stockReport } from "@/lib/low-stock";
import { requireAdmin } from "@/lib/viewer";

const FILTERS = [
  { key: "", label: "Все" },
  { key: "low", label: "Заканчиваются" },
  { key: "out", label: "Закончились" },
] as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const me = await requireAdmin();
  const { f = "", q = "" } = await searchParams;
  const [all, limit] = await Promise.all([stockReport(), lowStockThreshold()]);
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((r) => (f === "low" ? r.stock <= Math.max(limit, 0) : f === "out" ? r.stock <= 0 : true))
    .filter((r) => !needle || `${r.product} ${r.variant} ${r.sku ?? ""}`.toLowerCase().includes(needle));
  const out = all.filter((r) => r.stock <= 0).length;
  const low = all.filter((r) => r.stock > 0 && r.stock <= limit).length;

  return (
    <>
      <h1>Остатки</h1>
      <div className="stats">
        <Link href="/admin/stock?f=out" className="stat" style={{ color: "inherit", textDecoration: "none" }}>
          <div className="muted small">Закончились</div>
          <div className="stat__value">{num(out)}</div>
        </Link>
        <Link href="/admin/stock?f=low" className="stat" style={{ color: "inherit", textDecoration: "none" }}>
          <div className="muted small">Осталось {limit > 0 ? `${limit} шт и меньше` : "мало"}</div>
          <div className="stat__value">{num(low)}</div>
        </Link>
        <div className="stat">
          <div className="muted small">Вариантов в продаже</div>
          <div className="stat__value">{num(all.length)}</div>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {limit > 0
          ? `Когда остаток варианта опускается до ${limit} шт, админам с подключённым Telegram приходит предупреждение.`
          : "Предупреждения выключены."}{" "}
        {me.role === "OWNER" && <Link href="/admin/settings#stock-settings">Изменить порог</Link>}
        {" · "}Остатки уже за вычетом товара в неоплаченных заказах (резерв). Массово поменять остатки —{" "}
        <Link href="/admin/catalog/import">через Excel</Link>.
      </p>

      <form className="row" style={{ alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 6 }}>
          {FILTERS.map((x) => (
            <Link key={x.key} href={`/admin/stock${x.key ? `?f=${x.key}` : ""}`} className={`btn btn--sm ${f === x.key ? "btn--gold" : "btn--line"}`}>
              {x.label}
            </Link>
          ))}
        </div>
        <input type="hidden" name="f" value={f} />
        <label className="field" style={{ flex: "1 1 220px" }}>
          Поиск
          <input className="input" name="q" defaultValue={q} placeholder="Название или артикул" />
        </label>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Артикул</th>
              <th style={{ textAlign: "right" }}>Остаток</th>
              <th style={{ textAlign: "right" }}>В резерве</th>
              <th style={{ textAlign: "right" }}>Продано за 30 дн.</th>
              <th style={{ textAlign: "right" }}>Хватит примерно на</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const perDay = r.sold30 / 30;
              const days = perDay > 0 ? Math.floor(r.stock / perDay) : null;
              const tone = r.stock <= 0 ? "pill--bad" : r.stock <= limit ? "pill--warn" : "";
              return (
                <tr key={r.variantId}>
                  <td>
                    <Link href={`/admin/catalog/product/${r.productId}`}>{r.product}</Link>
                    {r.multi && <div className="muted small">{r.variant}</div>}
                    {r.visibility !== "PUBLISHED" && <div className="muted small">{r.visibility === "DRAFT" ? "черновик" : "скрыт"}</div>}
                  </td>
                  <td className="small">{r.sku ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{tone ? <span className={`pill ${tone}`}>{r.stock <= 0 ? "нет" : num(r.stock)}</span> : num(r.stock)}</td>
                  <td style={{ textAlign: "right" }}>{r.reserved ? num(r.reserved) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.sold30 ? num(r.sold30) : "—"}</td>
                  <td style={{ textAlign: "right" }} className="small">
                    {r.stock <= 0 ? "—" : days == null ? "продаж не было" : days > 365 ? "больше года" : `${num(days)} дн.`}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {f ? "Таких товаров нет — всё в наличии" : "Товаров пока нет"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
