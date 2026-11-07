import { PosScreen } from "@/app/admin/pos/PosScreen";
import { requireCashier } from "@/lib/viewer";

export default async function KassaPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const { me, admin } = await requireCashier();
  const r = (await searchParams).return ?? "";
  return <PosScreen me={me} admin={admin} returnNumber={/^K-\d{6}-[A-Z0-9]{4}$/.test(r) ? r : ""} />;
}
