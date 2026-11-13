import type { Metadata } from "next";
import { clubLines } from "@/lib/club-low";
import { labelClub, parseLabelQuery } from "@/lib/labels";
import { requireAdmin } from "@/lib/viewer";
import { PrintButton } from "../labels/PrintButton";

export const metadata: Metadata = { title: "Лист сборки", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Лист сборки пополнения клуба: по порядку ячеек склада, с клеточкой «собрал». ?club=<id>&i=<variantId>:<шт>,… */
export default async function PickPrint({ searchParams }: { searchParams: Promise<{ club?: string; i?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const club = await labelClub(sp.club);
  const want = new Map(parseLabelQuery(sp.i).map((x) => [x.id, x.n]));
  const lines = club && sp.club ? (await clubLines(sp.club)).filter((l) => want.has(l.variantId)) : [];
  // По полкам: A-2 раньше A-10; без ячейки — в конце
  lines.sort((a, b) => (a.bin ? 0 : 1) - (b.bin ? 0 : 1) || (a.bin ?? "").localeCompare(b.bin ?? "", "ru", { numeric: true }) || a.name.localeCompare(b.name, "ru"));
  const units = lines.reduce((a, l) => a + (want.get(l.variantId) ?? 0), 0);
  const today = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long" }).format(new Date());
  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        body { background: #fff; }
        .pick { color: #000; font-family: Arial, sans-serif; font-size: 11pt; max-width: 186mm; }
        .pick h1 { font-size: 16pt; margin: 0 0 2mm; }
        .pick table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
        .pick th, .pick td { border: 0.2mm solid #000; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
        .pick th { font-size: 9pt; }
        .pick .n { text-align: right; white-space: nowrap; }
        .pick .box { width: 8mm; }
        .pick .bin { font-weight: 700; white-space: nowrap; }
        .pick small { color: #444; }
        .pick__sign { display: flex; gap: 12mm; margin-top: 10mm; font-size: 10pt; }
        @media screen { .pick { padding: 12px; } .lbl-bar { padding: 12px; font-family: Arial, sans-serif; } }
        @media print { .lbl-bar { display: none; } }
      `}</style>
      <div className="lbl-bar">
        <PrintButton count={lines.length} />
      </div>
      <div className="pick">
        <h1>Лист сборки: Склад → {club ?? "клуб"}</h1>
        <div>
          {today} · {lines.length} поз., {units} шт
        </div>
        <table>
          <thead>
            <tr>
              <th className="box">✓</th>
              <th>Ячейка</th>
              <th>Товар</th>
              <th className="n">На складе</th>
              <th className="n">Взять, шт</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.variantId}>
                <td className="box" />
                <td className="bin">{l.bin ?? "—"}</td>
                <td>
                  {l.name}
                  {l.sku && (
                    <>
                      <br />
                      <small>{l.sku}</small>
                    </>
                  )}
                </td>
                <td className="n">{l.warehouse}</td>
                <td className="n">
                  <b>{want.get(l.variantId)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pick__sign">
          <span>Собрал: ______________________</span>
          <span>Принял в клубе: ______________________</span>
        </div>
      </div>
      {!lines.length && <p style={{ padding: 16 }}>Нечего собирать — откройте «Пополнить клуб» и отметьте товары.</p>}
    </>
  );
}
