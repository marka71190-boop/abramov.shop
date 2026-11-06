import { desc, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { reorderReport } from "@/lib/reorder";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { ReorderSettings, ReorderTable } from "./ReorderTable";

export const metadata: Metadata = { title: "Что докупить" };
export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  const me = await requireAdmin();
  const [{ rows, lead, cover, window }, sup] = await Promise.all([
    reorderReport(),
    db.selectDistinct({ supplier: s.supplierOrder.supplier }).from(s.supplierOrder).where(ne(s.supplierOrder.status, "CANCELLED")).orderBy(desc(s.supplierOrder.supplier)).limit(50),
  ]);
  const canEdit = !isDirector(me);
  return (
    <>
      <h1>Что докупить</h1>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          ← Остатки
        </Link>
        <Link href="/admin/stock/orders" className="btn btn--sm btn--line">
          Заказы поставщикам
        </Link>
      </div>
      <ReorderTable rows={rows} suppliers={sup.map((x) => x.supplier)} lead={lead} cover={cover} window={window} canEdit={canEdit} />
      {canEdit && <ReorderSettings lead={lead} cover={cover} window={window} />}
    </>
  );
}
