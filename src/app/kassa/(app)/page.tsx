import { PosScreen } from "@/app/admin/pos/PosScreen";
import { requireCashier } from "@/lib/viewer";

export default async function KassaPage() {
  const { me, admin } = await requireCashier();
  return <PosScreen me={me} admin={admin} />;
}
