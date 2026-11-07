import Link from "next/link";
import { num, rub } from "@/lib/format";
import { lowStockThreshold, stockReport } from "@/lib/low-stock";
import { isDirector, requireAdmin } from "@/lib/viewer";

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
  const value = all.reduce((a, r) => a + (r.stock > 0 && r.costPrice != null ? r.stock * r.costPrice : 0), 0);
  const retail = all.reduce((a, r) => a + (r.stock > 0 ? r.stock * r.price : 0), 0);
  const noCost = all.filter((r) => r.stock > 0 && r.costPrice == null).length;

  return (
    <>
      <h1>Остатки</h1>
      {!isDirector(me) && (
        <div className="row" style={{ gap: 6 }}>
          <Link href="/admin/stock/move?t=RECEIPT" className="btn btn--sm btn--gold">
            + Приход товара
          </Link>
          <Link href="/admin/stock/move?t=WRITE_OFF" className="btn btn--sm btn--line">
            Списание
          </Link>
          <Link href="/admin/stock/move?t=INVENTORY" className="btn btn--sm btn--line">
            Инвентаризация
          </Link>
          <Link href="/admin/stock/transfer" className="btn btn--sm btn--line">
            Перемещение
          </Link>
          <Link href="/admin/stock/clubs" className="btn btn--sm btn--line">
            По клубам
          </Link>
          <Link href="/admin/stock/reorder" className="btn btn--sm btn--line">
            Что докупить
          </Link>
          <Link href="/admin/stock/orders" className="btn btn--sm btn--line">
            Заказы поставщикам
          </Link>
          <Link href="/admin/stock/labels" className="btn btn--sm btn--line">
            Этикетки
          </Link>
          <Link href="/admin/stock/history" className="btn btn--sm btn--line">
            Журнал движений
          </Link>
        </div>
      )}
      {isDirector(me) && (
        <div className="row small" style={{ gap: 16 }}>
          <Link href="/admin/stock/reorder">Что докупить →</Link>
          <Link href="/admin/stock/history">Журнал движений товара →</Link>
        </div>
      )}
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
        <div className="stat">
          <div className="muted small">Товара на складе по закупке</div>
          <div className="stat__value">{rub(value)}</div>
          <div className="muted small">по ценам продажи {rub(retail)}</div>
        </div>
      </div>
      {noCost > 0 && (
        <p className="small" style={{ margin: 0 }}>
          <span className="pill pill--warn">Без закупочной цены: {num(noCost)}</span> — у этих товаров прибыль не посчитается. Впишите закупку в{" "}
          <Link href="/admin/catalog/prices">таблице цен</Link> или проведите приход.
        </p>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        {limit > 0 ? `Когда остаток варианта опускается до ${limit} шт, админам с подключённым Telegram приходит предупреждение.` : "Предупреждения выключены."}{" "}
        {me.role === "OWNER" && <Link href="/admin/settings#stock-settings">Изменить порог</Link>}
        {" · "}Остатки уже за вычетом товара в неоплаченных заказах (резерв). Поменять остатки и цены — <Link href="/admin/catalog/prices">таблицей</Link> или{" "}
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
              <th style={{ textAlign: "right" }}>Закупка</th>
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
                  <td style={{ textAlign: "right" }} className="small">
                    {r.costPrice != null ? rub(r.costPrice) : <span className="muted">—</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.sold30 ? num(r.sold30) : "—"}</td>
                  <td style={{ textAlign: "right" }} className="small">
                    {r.stock <= 0 ? "—" : days == null ? "продаж не было" : days > 365 ? "больше года" : `${num(days)} дн.`}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="muted">
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
