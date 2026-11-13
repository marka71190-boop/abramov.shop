import type { Metadata } from "next";
import Link from "next/link";
import { canBarcode, isEan13 } from "@/lib/barcode";
import { stockClubs } from "@/lib/club-stock";
import { parseLabelQuery } from "@/lib/labels";
import { ensureShopBarcodes } from "@/lib/shop-barcodes";
import { variantOptions } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";
import { LabelPicker } from "./LabelPicker";

export const metadata: Metadata = { title: "Этикетки" };
export const dynamic = "force-dynamic";

/**
 * Этикетки со штрихкодом. ?club=<id> — для клуба: остаток клуба и «Сколько в клубе»;
 * ?i=<variantId>:<копий>,… — сразу отметить товары (например, после перемещения в клуб).
 */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ club?: string; i?: string }> }) {
  await requireAdmin();
  await ensureShopBarcodes();
  const sp = await searchParams;
  const clubs = (await stockClubs()).filter((c) => c.ownStock).map((c) => ({ id: c.id, title: c.title }));
  const club = clubs.find((c) => c.id === sp.club) ?? null;
  const options = await variantOptions(club?.id ?? null);
  const rows = options
    .filter((o) => o.visibility !== "DRAFT" || o.stock > 0)
    .map((o) => ({ id: o.id, name: o.name, sku: o.sku, stock: o.stock, price: o.price, ok: isEan13(o.barcode) || canBarcode(o.sku), barcode: o.barcode }));
  const missing = rows.filter((r) => !r.ok).length;
  const preset = Object.fromEntries(parseLabelQuery(sp.i).map((x) => [x.id, String(x.n)]));
  return (
    <>
      <h1>Этикетки и ценники</h1>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          ← Остатки
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Наклейте этикетку на товар — в кассе и при приходе достаточно отсканировать штрихкод: товар добавится сам. Подойдёт любой USB- или Bluetooth-сканер, который работает «как клавиатура».
      </p>
      <LabelPicker key={`${club?.id ?? "wh"}:${sp.i ?? ""}`} rows={rows} missing={missing} clubs={clubs} club={club} preset={preset} />
    </>
  );
}
