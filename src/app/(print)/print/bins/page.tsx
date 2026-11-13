import type { Metadata } from "next";
import { parseBins } from "@/lib/bin-code";
import { qrSvg } from "@/lib/qr";
import { SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { PrintButton } from "../labels/PrintButton";

export const metadata: Metadata = { title: "Наклейки на полки", robots: { index: false } };
export const dynamic = "force-dynamic";

const FORMATS = {
  "50x30": { w: 50, h: 30, sheet: false },
  "58x40": { w: 58, h: 40, sheet: false },
  a4: { w: 70, h: 37, sheet: true },
} as const;

/** Наклейки на полки: QR-код открывает ячейку в админке, рядом крупно её имя. ?c=A-1,A-2&f=58x40 */
export default async function BinsPrint({ searchParams }: { searchParams: Promise<{ f?: string; c?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const fmt = FORMATS[(sp.f ?? "58x40") as keyof typeof FORMATS] ?? FORMATS["58x40"];
  const bins = await Promise.all(parseBins(sp.c).map(async (code) => ({ code, qr: await qrSvg(`${SITE.url}/admin/stock/bins/${encodeURIComponent(code)}`) })));
  // QR — не больше 42 % ширины: остальное — имя ячейки, оно должно читаться издалека
  const side = Math.min(fmt.h - 8, Math.round(fmt.w * 0.42));
  const small = fmt.h < 35;
  const pt = (n: number) => (n <= 3 ? (small ? 24 : 32) : n <= 5 ? (small ? 16 : 21) : n <= 8 ? (small ? 10 : 13) : small ? 8 : 10);
  return (
    <>
      <style>{`
        @page { size: ${fmt.sheet ? "A4" : `${fmt.w}mm ${fmt.h}mm`}; margin: 0; }
        body { background: #fff; }
        .bin-sheet { display: ${fmt.sheet ? "grid" : "block"}; grid-template-columns: repeat(3, ${fmt.w}mm); }
        .bin { width: ${fmt.w}mm; height: ${fmt.h}mm; box-sizing: border-box; padding: 3mm; display: flex; align-items: center; gap: 2mm; overflow: hidden; color: #000; background: #fff; font-family: Arial, sans-serif; break-inside: avoid; ${fmt.sheet ? "" : "page-break-after: always; break-after: page;"} }
        .bin:last-child { page-break-after: auto; break-after: auto; }
        .bin__qr { flex: none; width: ${side}mm; height: ${side}mm; }
        .bin__qr svg { display: block; width: 100%; height: 100%; }
        .bin__text { flex: 1; min-width: 0; text-align: center; }
        .bin__code { font-weight: 800; line-height: 1; white-space: nowrap; }
        .bin__code--long { white-space: normal; word-break: break-all; }
        .bin__hint { font-size: 6pt; margin-top: 1.5mm; letter-spacing: .08em; text-transform: uppercase; }
        @media screen { .bin { outline: 1px dashed #bbb; margin: 0 0 4mm; } .lbl-bar { padding: 12px; font-family: Arial, sans-serif; } }
        @media print { .lbl-bar { display: none; } }
      `}</style>
      <div className="lbl-bar">
        <PrintButton count={bins.length} />
      </div>
      <div className="bin-sheet">
        {bins.map((b) => (
          <div key={b.code} className="bin">
            <div className="bin__qr" dangerouslySetInnerHTML={{ __html: b.qr }} />
            <div className="bin__text">
              {/* Короткое имя — крупнее: «A-3» читается с двух метров */}
              <div className={`bin__code${b.code.length > 8 ? " bin__code--long" : ""}`} style={{ fontSize: `${pt(b.code.length)}pt` }}>
                {b.code}
              </div>
              <div className="bin__hint">ячейка</div>
            </div>
          </div>
        ))}
      </div>
      {!bins.length && <p style={{ padding: 16 }}>Нечего печатать — укажите ячейки на странице «Ячейки хранения».</p>}
    </>
  );
}
