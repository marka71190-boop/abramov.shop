import type { Metadata } from "next";
import Link from "next/link";
import { binList, binRows } from "@/lib/bins";
import { num } from "@/lib/format";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { BinPrint, BinsTable } from "./BinsTable";

export const metadata: Metadata = { title: "Ячейки хранения" };
export const dynamic = "force-dynamic";

/** Ячейки склада: где что лежит, раскладка по полкам и наклейки с QR на полки */
export default async function BinsPage() {
  const me = await requireAdmin();
  const [bins, rows] = await Promise.all([binList(), binRows()]);
  const placed = rows.filter((r) => r.bin).length;
  const loose = rows.filter((r) => !r.bin && r.stock > 0).length;
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/stock">← Остатки</Link>
      </p>
      <h1>Ячейки хранения</h1>
      <p className="muted" style={{ margin: 0 }}>
        Дайте полкам короткие имена — «A-1», «A-2», «Б-3» — и впишите их товарам. На полку клеится наклейка с QR-кодом: навели телефон — видно, что на ней должно
        лежать. Лист сборки для клуба идёт по порядку ячеек, а не по алфавиту.
      </p>
      <div className="stats">
        <div className="stat">
          <div className="muted small">Ячеек</div>
          <div className="stat__value">{num(bins.length)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Товаров разложено</div>
          <div className="stat__value">{num(placed)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Есть на складе, но без ячейки</div>
          <div className="stat__value">{num(loose)}</div>
        </div>
      </div>
      {bins.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {bins.map((b) => (
            <Link key={b.bin} href={`/admin/stock/bins/${encodeURIComponent(b.bin)}`} className="btn btn--sm btn--line" title={`${b.items} поз., ${b.units} шт`}>
              <b>{b.bin}</b>&nbsp;· {b.items} поз.
            </Link>
          ))}
        </div>
      )}
      <BinPrint bins={bins.map((b) => b.bin)} />
      <h2 className="h4" style={{ margin: 0 }}>
        Разложить товары
      </h2>
      <BinsTable rows={rows} readonly={isDirector(me)} />
    </>
  );
}
