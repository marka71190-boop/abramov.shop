/** GET /admin/waybills/pdf?kind=waybill|barcode&id=…&id=…&format=A6 — PDF накладных или штрихкодов из СДЭК */
import { and, inArray, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { cdekEnabled, printPdf, type BarcodeFormat } from "@/lib/cdek";
import { requireAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const page = (text: string, status = 400) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Накладные</title><body style="font:16px system-ui;padding:32px;background:#0a0a0a;color:#f3f2ef"><p>${text.replace(/</g, "&lt;")}</p><p><a style="color:#dcbf83" href="/admin/waybills">← К накладным</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export async function GET(request: Request) {
  await requireAdmin();
  if (!cdekEnabled()) return page("СДЭК не подключён");
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind") === "barcode" ? "barcode" : "waybill";
  const format = (["A4", "A5", "A6", "A7"].includes(q.get("format") ?? "") ? q.get("format") : "A6") as BarcodeFormat;
  const ids = q.getAll("id").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 100);
  if (!ids.length) return page("Отметьте заказы, для которых нужны накладные");
  const rows = await db
    .select({ uuid: s.order.cdekOrderUuid })
    .from(s.order)
    .where(and(inArray(s.order.id, ids), isNotNull(s.order.cdekOrderUuid)));
  const uuids = rows.map((r) => r.uuid!).filter(Boolean);
  if (!uuids.length) return page("У отмеченных заказов ещё нет отправления СДЭК — сначала создайте его");
  try {
    const pdf = await printPdf(kind, uuids, { format, copies: kind === "waybill" ? 2 : 1 });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="cdek-${kind === "waybill" ? "nakladnye" : "shtrihkody"}-${day}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[cdek] печать:", e instanceof Error ? e.message : e);
    return page(e instanceof Error ? e.message : "СДЭК не ответил — попробуйте ещё раз", 502);
  }
}
