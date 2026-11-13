import type { Metadata } from "next";
import { rub } from "@/lib/format";
import { labelItems, parseLabelQuery } from "@/lib/labels";
import { qrSvg } from "@/lib/qr";
import { SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { PrintButton } from "../labels/PrintButton";

export const metadata: Metadata = { title: "Ценники на витрину", robots: { index: false } };
export const dynamic = "force-dynamic";

// На лист A4 (210×297): крупные — 2×4, средние — 3×7. Поля листа 6 мм — печатает любой принтер
const SIZES = {
  big: { cols: 2, w: 99, h: 71, name: 15, price: 34, qr: 24 },
  mid: { cols: 3, w: 66, h: 40.5, name: 9.5, price: 20, qr: 15 },
} as const;

/** Ценники на витрину: название, крупная цена, QR на товар. Режутся по пунктиру. ?i=<variantId>:<копий>&s=big|mid&q=1 */
export default async function PriceTagsPrint({ searchParams }: { searchParams: Promise<{ i?: string; s?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const size = SIZES[(sp.s ?? "big") as keyof typeof SIZES] ?? SIZES.big;
  const withQr = sp.q !== "0";
  const items = await labelItems(parseLabelQuery(sp.i));
  const tags = (
    await Promise.all(
      items.map(async (r) => {
        const t = { ...r, qr: withQr ? await qrSvg(r.url) : null };
        return Array.from({ length: r.copies }, () => t);
      }),
    )
  ).flat();
  return (
    <>
      <style>{`
        @page { size: A4; margin: 6mm; }
        body { background: #fff; }
        .pt-sheet { display: grid; grid-template-columns: repeat(${size.cols}, ${size.w}mm); }
        .pt { width: ${size.w}mm; height: ${size.h}mm; box-sizing: border-box; padding: ${size.cols === 2 ? "5mm 6mm" : "3mm 3.5mm"}; border: 0.2mm dashed #999; margin: 0 -0.2mm -0.2mm 0; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; color: #000; background: #fff; font-family: Arial, sans-serif; break-inside: avoid; }
        .pt__brand { font-size: ${size.cols === 2 ? 8 : 6}pt; letter-spacing: .14em; text-transform: uppercase; color: #444; }
        .pt__name { font-size: ${size.name}pt; line-height: 1.15; font-weight: 700; max-height: 3.5em; overflow: hidden; margin-top: 1mm; }
        .pt__variant { font-size: ${size.name * 0.75}pt; margin-top: 0.5mm; }
        .pt__bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 2mm; }
        .pt__old { font-size: ${size.price * 0.4}pt; text-decoration: line-through; color: #444; line-height: 1; }
        .pt__price { font-size: ${size.price}pt; font-weight: 800; line-height: 1; white-space: nowrap; }
        .pt__sku { font-size: ${size.cols === 2 ? 7 : 5.5}pt; color: #444; margin-top: 1mm; }
        .pt__qr { flex: none; width: ${size.qr}mm; text-align: center; font-size: ${size.cols === 2 ? 5.5 : 4.5}pt; line-height: 1.1; color: #444; }
        .pt__qr svg { display: block; width: ${size.qr}mm; height: ${size.qr}mm; }
        @media screen { .pt-sheet { margin: 0 12px 24px; } .lbl-bar { padding: 12px; font-family: Arial, sans-serif; } }
        @media print { .lbl-bar { display: none; } }
      `}</style>
      <div className="lbl-bar">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <PrintButton count={tags.length} />
        </div>
        <p style={{ color: "#555", fontSize: 13, margin: "6px 0 0" }}>Лист A4, масштаб 100 %. Режьте по пунктиру. Плотная бумага 160–200 г/м² стоит на полке лучше.</p>
      </div>
      <div className="pt-sheet">
        {tags.map((t, i) => (
          <div key={i} className="pt">
            <div>
              <div className="pt__brand">{SITE.name}</div>
              <div className="pt__name">{t.name}</div>
              {t.variant && <div className="pt__variant">{t.variant}</div>}
            </div>
            <div className="pt__bottom">
              <div>
                {t.oldPrice && <div className="pt__old">{rub(t.oldPrice)}</div>}
                <div className="pt__price">{rub(t.price)}</div>
                <div className="pt__sku">{t.sku ?? t.code}</div>
              </div>
              {t.qr && (
                <div className="pt__qr">
                  <div dangerouslySetInnerHTML={{ __html: t.qr }} />
                  подробнее на сайте
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {!tags.length && <p style={{ padding: 16 }}>Нечего печатать — выберите товары на странице «Этикетки».</p>}
    </>
  );
}
