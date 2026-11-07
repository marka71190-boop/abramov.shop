import type { Metadata } from "next";
import { barcodeSvg } from "@/lib/barcode";
import { rub } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { labelItems, parseLabelQuery } from "@/lib/labels";
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
  const withQr = sp.q === "1";
  const items = await labelItems(parseLabelQuery(sp.i));
  const labels = (
    await Promise.all(
      items.map(async (r) => {
        const item = { name: r.name, variant: r.variant, sku: r.sku, price: r.price, svg: barcodeSvg(r.sku, { height: 40 }), qr: withQr ? await qrSvg(r.url) : null };
        return Array.from({ length: r.copies }, () => item);
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
