import type { Metadata } from "next";
import { requireAdmin } from "@/lib/viewer";
import { PosScreen } from "./PosScreen";

export const metadata: Metadata = { title: "Касса" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const me = await requireAdmin();
  return <PosScreen me={me} admin />;
}
