import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { normBin } from "@/lib/bin-code";
import { binRows } from "@/lib/bins";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { BinContents } from "./BinContents";

export const metadata: Metadata = { title: "Ячейка" };
export const dynamic = "force-dynamic";

/** Ячейка: сюда ведёт QR с наклейки на полке. Что должно лежать; добавить товар сканером */
export default async function BinPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireAdmin();
  const code = normBin(decodeURIComponent((await params).code));
  if (!code) notFound();
  const rows = await binRows();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/stock/bins">← Все ячейки</Link>
      </p>
      <h1>Ячейка {code}</h1>
      <BinContents code={code} rows={rows} readonly={isDirector(me)} />
    </>
  );
}
