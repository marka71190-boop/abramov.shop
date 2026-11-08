import Link from "next/link";
import { variantOptions } from "@/lib/stock-moves";
import { stockClubs } from "@/lib/club-stock";
import { redirect } from "next/navigation";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { MoveForm } from "./MoveForm";

export const dynamic = "force-dynamic";

const KINDS = [
  { key: "RECEIPT", label: "Приход", title: "Приход товара", text: "Привезли товар — добавьте строки и закупочную цену. Остаток на сайте увеличится сразу." },
  { key: "WRITE_OFF", label: "Списание", title: "Списание", text: "Брак, порча, подарок, взяли себе — товар уйдёт из остатка, его себестоимость попадёт в расходы." },
  { key: "INVENTORY", label: "Инвентаризация", title: "Инвентаризация", text: "Пересчитали склад — укажите, сколько товара на самом деле. Разница запишется в журнал." },
] as const;

export default async function StockMovePage({ searchParams }: { searchParams: Promise<{ t?: string; c?: string }> }) {
  const me = await requireAdmin();
  if (isDirector(me)) redirect("/admin/stock");
  const { t, c } = await searchParams;
  const kind = KINDS.find((k) => k.key === t) ?? KINDS[0];
  // Где: склад или клуб со своим учётом
  const clubs = (await stockClubs()).filter((x) => x.ownStock);
  const club = clubs.find((x) => x.id === c) ?? null;
  const options = await variantOptions(club?.id ?? null);
  // Для нового товара прямо из приёмки
  const categories = kind.key === "RECEIPT" ? await db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.name)) : [];
  return (
    <>
      <h1>{kind.title}</h1>
      <div className="row" style={{ gap: 6 }}>
        {KINDS.map((k) => (
          <Link key={k.key} href={`/admin/stock/move?t=${k.key}${club ? `&c=${club.id}` : ""}`} className={`btn btn--sm ${k.key === kind.key ? "btn--gold" : "btn--line"}`}>
            {k.label}
          </Link>
        ))}
        <Link href="/admin/stock/history" className="btn btn--sm btn--line">
          Журнал движений
        </Link>
      </div>
      {clubs.length > 0 && (
        <div className="row small" style={{ gap: 6, alignItems: "center" }}>
          <span className="muted">Где:</span>
          <Link href={`/admin/stock/move?t=${kind.key}`} className={`btn btn--sm ${!club ? "btn--gold" : "btn--line"}`}>
            Склад
          </Link>
          {clubs.map((x) => (
            <Link key={x.id} href={`/admin/stock/move?t=${kind.key}&c=${x.id}`} className={`btn btn--sm ${club?.id === x.id ? "btn--gold" : "btn--line"}`}>
              {x.title}
            </Link>
          ))}
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>
        {club ? `В клубе «${club.title}». ` : ""}
        {kind.text}
      </p>
      <MoveForm key={`${kind.key}-${club?.id ?? "wh"}`} kind={kind.key} options={options} clubId={club?.id ?? null} categories={categories} />
    </>
  );
}
