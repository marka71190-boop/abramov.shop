import Link from "next/link";
import { redirect } from "next/navigation";
import { stockClubs } from "@/lib/club-stock";
import { variantOptions } from "@/lib/stock-moves";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { TransferForm } from "./TransferForm";

export const metadata = { title: "Перемещение товара" };
export const dynamic = "force-dynamic";

/** Перемещение: склад → клуб, клуб → склад, клуб → клуб */
export default async function TransferPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requireAdmin();
  if (isDirector(me)) redirect("/admin/stock");
  const clubs = (await stockClubs()).filter((c) => c.ownStock);
  const locations = [{ id: "", title: "Склад" }, ...clubs.map((c) => ({ id: c.id, title: c.title }))];
  const sp = await searchParams;
  const pick = (v: string | undefined, def: string) => (v === "wh" ? "" : locations.some((l) => l.id === v) ? v! : def);
  const from = pick(sp.from, "");
  const to = pick(sp.to, clubs[0]?.id ?? "");
  const options = await variantOptions(from || null);
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/stock">← Остатки</Link>
      </p>
      <h1>Перемещение товара</h1>
      {!clubs.length ? (
        <div className="notice">
          Ни у одного клуба не включён свой учёт остатков. Включите его в <Link href="/admin/stock/clubs">«По клубам»</Link> — тогда касса клуба будет продавать
          из остатка клуба, а товар туда попадёт перемещением со склада.
        </div>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Отвезли товар в клуб или забрали обратно. Остаток уменьшится там, откуда забрали, и увеличится там, куда привезли. На сайте продаётся только товар со
            склада.
          </p>
          <TransferForm key={`${from}-${to}`} locations={locations} from={from} to={to} options={options} />
        </>
      )}
    </>
  );
}
