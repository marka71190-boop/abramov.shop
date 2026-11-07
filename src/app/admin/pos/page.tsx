import type { Metadata } from "next";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { PosScreen } from "./PosScreen";

export const metadata: Metadata = { title: "Касса" };
export const dynamic = "force-dynamic";

export default async function PosPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const me = await requireAdmin();
  const r = (await searchParams).return ?? "";
  return <PosScreen me={me} admin readonly={isDirector(me)} returnNumber={/^K-\d{6}-[A-Z0-9]{4}$/.test(r) ? r : ""} />;
}
