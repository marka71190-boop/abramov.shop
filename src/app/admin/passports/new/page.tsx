import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/viewer";
import { PassportForm } from "../PassportForm";

export const dynamic = "force-dynamic";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

/** Выпуск паспорта: из заказа (?order=&item=) — модель и параметры подставляются, владелец — покупатель */
export default async function NewPassportPage({ searchParams }: { searchParams: Promise<{ order?: string; item?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const order = sp.order ? await db.query.order.findFirst({ where: eq(s.order.id, sp.order.slice(0, 64)), with: { items: true } }) : null;
  const item = order?.items.find((i) => i.id === sp.item) ?? null;
  // Мастер по умолчанию — из последнего паспорта
  const last = await db.query.cuePassport.findFirst({ where: and(isNotNull(s.cuePassport.master)), orderBy: desc(s.cuePassport.createdAt), columns: { master: true } });
  return (
    <>
      <Link href="/admin/passports" className="small">
        ← Паспорта киёв
      </Link>
      <h1>Выпустить паспорт кия</h1>
      <PassportForm
        orderLabel={order ? order.number : null}
        data={{
          model: item?.name ?? "",
          spec: item?.spec ?? "",
          master: last?.master ?? "",
          madeAt: today(),
          warrantyMonths: 12,
          photo: "",
          orderId: order?.id,
          orderItemId: item?.id,
        }}
      />
    </>
  );
}
