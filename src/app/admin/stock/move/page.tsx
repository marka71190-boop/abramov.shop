import Link from "next/link";
import { variantOptions } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";
import { MoveForm } from "./MoveForm";

export const dynamic = "force-dynamic";

const KINDS = [
  { key: "RECEIPT", label: "Приход", title: "Приход товара", text: "Привезли товар — добавьте строки и закупочную цену. Остаток на сайте увеличится сразу." },
  { key: "WRITE_OFF", label: "Списание", title: "Списание", text: "Брак, порча, подарок, взяли себе — товар уйдёт из остатка, его себестоимость попадёт в расходы." },
  { key: "INVENTORY", label: "Инвентаризация", title: "Инвентаризация", text: "Пересчитали склад — укажите, сколько товара на самом деле. Разница запишется в журнал." },
] as const;

export default async function StockMovePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requireAdmin();
  const { t } = await searchParams;
  const kind = KINDS.find((k) => k.key === t) ?? KINDS[0];
  const options = await variantOptions();
  return (
    <>
      <h1>{kind.title}</h1>
      <div className="row" style={{ gap: 6 }}>
        {KINDS.map((k) => (
          <Link key={k.key} href={`/admin/stock/move?t=${k.key}`} className={`btn btn--sm ${k.key === kind.key ? "btn--gold" : "btn--line"}`}>
            {k.label}
          </Link>
        ))}
        <Link href="/admin/stock/history" className="btn btn--sm btn--line">
          Журнал движений
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {kind.text}
      </p>
      <MoveForm key={kind.key} kind={kind.key} options={options} />
    </>
  );
}
