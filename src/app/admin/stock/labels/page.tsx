import type { Metadata } from "next";
import Link from "next/link";
import { canBarcode } from "@/lib/barcode";
import { variantOptions } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";
import { LabelPicker } from "./LabelPicker";

export const metadata: Metadata = { title: "Этикетки" };
export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  await requireAdmin();
  const options = await variantOptions();
  const rows = options
    .filter((o) => o.visibility !== "DRAFT" || o.stock > 0)
    .map((o) => ({ id: o.id, name: o.name, sku: o.sku, stock: o.stock, price: o.price, ok: canBarcode(o.sku) }));
  const missing = rows.filter((r) => !r.ok).length;
  return (
    <>
      <h1>Этикетки со штрихкодом</h1>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          ← Остатки
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Наклейте этикетку на товар — в кассе и при приходе достаточно отсканировать штрихкод: товар добавится сам. Подойдёт любой USB- или Bluetooth-сканер, который работает «как клавиатура».
      </p>
      <LabelPicker rows={rows} missing={missing} />
    </>
  );
}
