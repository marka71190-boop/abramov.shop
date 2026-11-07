import { inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema as s } from "@/db";
import { barcodeSvg, canBarcode } from "@/lib/barcode";
import { rub } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Этикетки", robots: { index: false } };
export const dynamic = "force-dynamic";

const FORMATS = {
  "50x30": { w: 50, h: 30, sheet: false },
  "58x40": { w: 58, h: 40, sheet: false },
  "58x30": { w: 58, h: 30, sheet: false },
  a4: { w: 70, h: 37, sheet: true },
} as const;

/** Печать этикеток: штрихкод артикула, название, цена и QR-код — ссылка на товар на сайте */
export default async function LabelsPrint({ searchParams }: { searchParams: Promise<{ f?: string; p?: string; i?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const fmt = FORMATS[(sp.f ?? "58x40") as keyof typeof FORMATS] ?? FORMATS["58x40"];
  const wanted = String(sp.i ?? "")
    .split(",")
    .map((x) => x.split(":"))
    .filter(([id, n]) => id && Number(n) > 0)
    .slice(0, 500)
    .map(([id, n]) => ({ id, n: Math.min(500, Math.trunc(Number(n))) }));
  const ids = wanted.map((w) => w.id);
  const rows = ids.length
    ? await db
        .select({
          id: s.productVariant.id,
          product: s.product.name,
          slug: s.product.slug,
          variant: s.productVariant.name,
          multi: sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.product.id} and v2.is_active)`,
          sku: sql<string | null>`case when (select count(*) from product_variant v2 where v2.product_id = ${s.product.id} and v2.is_active) > 1 then ${s.productVariant.sku} else coalesce(${s.productVariant.sku}, ${s.product.sku}) end`,
          price: sql<number>`coalesce(${s.productVariant.price}, ${s.product.price})`,
        })
        .from(s.productVariant)
        .innerJoin(s.product, sql`${s.product.id} = ${s.productVariant.productId}`)
        .where(inArray(s.productVariant.id, ids))
    : [];
  const withQr = sp.q === "1";
  const labels = (
    await Promise.all(
      wanted.map(async (w) => {
        const r = rows.find((x) => x.id === w.id);
        if (!r || !canBarcode(r.sku)) return [];
        // QR — ссылка на товар; у товара с вариантами сразу открывается нужный вариант
        const url = `${SITE.url}/product/${r.slug}${r.multi > 1 ? `?v=${r.id}` : ""}`;
        const item = { name: r.product, variant: r.multi > 1 ? r.variant : null, sku: r.sku, price: Number(r.price), svg: barcodeSvg(r.sku, { height: 40 }), qr: withQr ? await qrSvg(url) : null };
        return Array.from({ length: w.n }, () => item);
      }),
    )
  ).flat();
  const withPrice = sp.p !== "0";
  const page = fmt.sheet ? "A4" : `${fmt.w}mm ${fmt.h}mm`;

  return (
    <>
      <style>{`
        @page { size: ${page}; margin: 0; }
        body { background: #fff; }
        .lbl-sheet { display: ${fmt.sheet ? "grid" : "block"}; grid-template-columns: repeat(3, ${fmt.w}mm); }
        .lbl { width: ${fmt.w}mm; height: ${fmt.h}mm; box-sizing: border-box; padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; color: #000; font-family: Arial, sans-serif; break-inside: avoid; ${fmt.sheet ? "" : "page-break-after: always; break-after: page;"} }
        .lbl:last-child { page-break-after: auto; break-after: auto; }
        .lbl { background: #fff; }
        .lbl__name { font-size: ${fmt.h < 35 ? 8 : 9}pt; line-height: 1.15; font-weight: 700; max-height: 2.4em; overflow: hidden; }
        .lbl__variant { font-size: 8pt; }
        .lbl__code svg { display: block; width: 100%; height: ${fmt.h < 35 ? 9 : 12}mm; }
        .lbl__row { display: flex; justify-content: space-between; align-items: baseline; font-size: 8pt; }
        .lbl__price { font-size: ${fmt.h < 35 ? 11 : 13}pt; font-weight: 700; }
        .lbl__top { display: flex; gap: 2mm; align-items: flex-start; min-height: 0; }
        .lbl__qr { flex: none; width: ${fmt.h < 35 ? 13 : 16}mm; height: ${fmt.h < 35 ? 13 : 16}mm; }
        .lbl__qr svg { display: block; width: 100%; height: 100%; }
        .lbl__info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.5mm; }
        .lbl--qr .lbl__name { max-height: 3.5em; font-size: ${fmt.h < 35 ? 7 : 8}pt; }
        .lbl--qr .lbl__price { font-size: ${fmt.h < 35 ? 10 : 12}pt; }
        .lbl--qr .lbl__code svg { height: ${fmt.h < 35 ? 7 : 10}mm; }
        .lbl--qr { padding: 1.5mm 2mm; }
        @media screen { .lbl { outline: 1px dashed #bbb; margin: 0 0 4mm; } .lbl-sheet { gap: 0; } .lbl-bar { padding: 12px; font-family: Arial, sans-serif; } }
        @media print { .lbl-bar { display: none; } }
      `}</style>
      <div className="lbl-bar">
        <PrintButton count={labels.length} />
      </div>
      <div className="lbl-sheet">
        {labels.map((l, i) => (
          <div key={i} className={`lbl${l.qr ? " lbl--qr" : ""}`}>
            {l.qr ? (
              <div className="lbl__top">
                <div className="lbl__qr" dangerouslySetInnerHTML={{ __html: l.qr }} />
                <div className="lbl__info">
                  <div className="lbl__name">{l.name}</div>
                  {l.variant && <div className="lbl__variant">{l.variant}</div>}
                  {withPrice && <div className="lbl__price">{rub(l.price)}</div>}
                </div>
              </div>
            ) : (
              <div>
                <div className="lbl__name">{l.name}</div>
                {l.variant && <div className="lbl__variant">{l.variant}</div>}
              </div>
            )}
            <div className="lbl__code" dangerouslySetInnerHTML={{ __html: l.svg }} />
            <div className="lbl__row">
              <span>{l.sku}</span>
              {withPrice && !l.qr && <span className="lbl__price">{rub(l.price)}</span>}
            </div>
          </div>
        ))}
      </div>
      {!labels.length && <p style={{ padding: 16 }}>Нечего печатать — выберите товары на странице «Этикетки».</p>}
    </>
  );
}
