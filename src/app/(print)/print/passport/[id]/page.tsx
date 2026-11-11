import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { passportUrl, warrantyUntil } from "@/lib/cue-passport";
import { fmtDate } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { requireAdmin } from "@/lib/viewer";
import { PrintButton } from "../../labels/PrintButton";

export const metadata: Metadata = { title: "Паспорт кия — печать", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Печать паспорта кия.
 *   f=card    — карточка 100×150 мм в коробку: модель, номер, параметры, гарантия, QR и код владельца;
 *   f=sticker — наклейка 30×20 мм на кий (NIIMBOT и другие термопринтеры): QR и номер.
 */
export default async function PassportPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await db.query.cuePassport.findFirst({ where: eq(s.cuePassport.id, String(id).slice(0, 64)) });
  if (!p) notFound();
  const qr = await qrSvg(passportUrl(p.code));
  const sticker = sp.f === "sticker";
  const specs = (p.spec ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 10);

  if (sticker)
    return (
      <>
        <style>{`
          @page { size: 30mm 20mm; margin: 0; }
          body { background: #fff; }
          .stk { width: 30mm; height: 20mm; box-sizing: border-box; padding: 1mm 1.2mm; display: flex; gap: 1mm; align-items: center; color: #000; font-family: Arial, sans-serif; overflow: hidden; }
          .stk__qr { flex: none; width: 17mm; height: 17mm; }
          .stk__qr svg { width: 100%; height: 100%; display: block; }
          .stk__t { font-size: 5.5pt; line-height: 1.2; }
          .stk__t b { display: block; font-size: 6.5pt; }
          @media screen { .stk { outline: 1px dashed #bbb; margin: 12px; } .bar { padding: 12px; font-family: Arial, sans-serif; } }
          @media print { .bar { display: none; } }
        `}</style>
        <div className="bar">
          <PrintButton count={1} />
        </div>
        <div className="stk">
          <div className="stk__qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="stk__t">
            <b>ABRAMOV</b>
            паспорт
            <br />
            {p.serial}
          </div>
        </div>
      </>
    );

  const until = warrantyUntil(p);
  return (
    <>
      <style>{`
        @page { size: 100mm 150mm; margin: 0; }
        body { background: #fff; }
        .card { background: #fff; width: 100mm; height: 150mm; box-sizing: border-box; padding: 8mm 8mm 7mm; display: flex; flex-direction: column; gap: 3.5mm; color: #111; font-family: Arial, sans-serif; border: 0.6mm solid #b8995a; }
        .card__brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.3mm solid #b8995a; padding-bottom: 2mm; }
        .card__brand b { font-size: 15pt; letter-spacing: 0.18em; color: #8a6d2f; }
        .card__brand span { font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; }
        .card__model { font-size: 13pt; font-weight: 700; line-height: 1.2; }
        .card__serial { font-size: 11pt; }
        .card__serial b { letter-spacing: 0.06em; }
        .card__rows { font-size: 8.5pt; line-height: 1.45; }
        .card__rows div { display: flex; gap: 2mm; }
        .card__rows i { font-style: normal; color: #666; min-width: 24mm; }
        .card__foot { margin-top: auto; display: flex; gap: 4mm; align-items: flex-end; }
        .card__qr { width: 30mm; height: 30mm; flex: none; }
        .card__qr svg { width: 100%; height: 100%; display: block; }
        .card__claim { font-size: 7.5pt; line-height: 1.35; }
        .card__claim b { display: inline-block; font-size: 13pt; letter-spacing: 0.14em; margin: 1mm 0; padding: 0.8mm 2mm; border: 0.3mm dashed #555; }
        @media screen { .card { margin: 12px; } .bar { padding: 12px; font-family: Arial, sans-serif; } }
        @media print { .bar { display: none; } }
      `}</style>
      <div className="bar">
        <PrintButton count={1} />
      </div>
      <div className="card">
        <div className="card__brand">
          <b>ABRAMOV</b>
          <span>Паспорт кия</span>
        </div>
        <div className="card__model">{p.model}</div>
        <div className="card__serial">
          № <b>{p.serial}</b>
        </div>
        <div className="card__rows">
          {p.master && (
            <div>
              <i>Мастер</i>
              {p.master}
            </div>
          )}
          <div>
            <i>Изготовлен</i>
            {fmtDate(p.madeAt)}
          </div>
          <div>
            <i>Гарантия</i>
            {p.warrantyMonths ? `до ${fmtDate(until)}` : "без гарантии"}
          </div>
          {specs.map((l, i) => {
            const k = l.indexOf(":");
            return (
              <div key={i}>
                <i>{k > 0 ? l.slice(0, k) : ""}</i>
                {k > 0 ? l.slice(k + 1).trim() : l}
              </div>
            );
          })}
        </div>
        <div className="card__foot">
          <div className="card__qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="card__claim">
            Отсканируйте QR — откроется паспорт на abramov.shop: подлинность, гарантия, история кия.
            <br />
            Код владельца:
            <br />
            <b>{p.claimCode}</b>
            <br />
            Им вы привяжете кий к своему аккаунту. Никому не показывайте.
          </div>
        </div>
      </div>
    </>
  );
}
