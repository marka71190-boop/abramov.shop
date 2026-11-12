import Link from "next/link";
import { redirect } from "next/navigation";
import { clubLines } from "@/lib/club-low";
import { stockClubs } from "@/lib/club-stock";
import { variantOptions } from "@/lib/stock-moves";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { EnableClubs } from "../clubs/EnableClubs";
import { TransferForm } from "./TransferForm";

export const metadata = { title: "Перемещение товара" };
export const dynamic = "force-dynamic";

/** Перемещение: склад → клуб, клуб → склад, клуб → клуб */
export default async function TransferPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requireAdmin();
  if (isDirector(me)) redirect("/admin/stock");
  const all = await stockClubs();
  const clubs = all.filter((c) => c.ownStock);
  const off = all.filter((c) => !c.ownStock);
  const locations = [{ id: "", title: "Склад" }, ...clubs.map((c) => ({ id: c.id, title: c.title }))];
  const sp = await searchParams;
  const pick = (v: string | undefined, def: string) => (v === "wh" ? "" : locations.some((l) => l.id === v) ? v! : def);
  const from = pick(sp.from, "");
  const to = pick(sp.to, clubs[0]?.id ?? "");
  // Откуда — что есть; куда — сколько там уже и какая норма (чтобы видеть, чего не хватает в клубе)
  const [options, dest] = await Promise.all([variantOptions(from || null), from === to ? Promise.resolve([]) : to ? clubLines(to) : variantOptions(null)]);
  const there: Record<string, { qty: number; norm: number | null }> = {};
  for (const d of dest) there["variantId" in d ? d.variantId : d.id] = { qty: "qty" in d ? d.qty : d.stock, norm: "minQty" in d ? d.minQty : null };
  return (
    <>
      <h1 style={{ marginBottom: 0 }}>Перемещение</h1>
      {!clubs.length ? (
        <div className="notice">
          Ни у одного клуба не включён свой учёт остатков. Включите его в <Link href="/admin/stock/clubs">«По клубам»</Link> — тогда касса клуба будет продавать
          из остатка клуба, а товар туда попадёт перемещением со склада.
        </div>
      ) : (
        <>
          <TransferForm key={`${from}-${to}`} locations={locations} from={from} to={to} options={options} there={there} />
        </>
      )}
      <EnableClubs clubs={off} owner={me.role === "OWNER"} />
    </>
  );
}
