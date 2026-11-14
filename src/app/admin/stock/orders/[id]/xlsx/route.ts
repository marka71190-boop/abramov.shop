/**
 * GET /admin/stock/orders/<id>/xlsx — заказ поставщику таблицей: код поставщика, наименование, количество.
 * Простой лист: поставщик копирует коды в свою программу. Цены закупки — только если их вписали.
 */
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return new Response("Нет доступа", { status: 403 });
  const o = await db.query.supplierOrder.findFirst({ where: eq(s.supplierOrder.id, (await params).id), with: { items: true } });
  if (!o) return new Response("Заказ не найден", { status: 404 });
  const items = [...o.items].sort((a, b) => (a.supplierCode ? 0 : 1) - (b.supplierCode ? 0 : 1) || (a.supplierCode ?? "").localeCompare(b.supplierCode ?? "") || a.name.localeCompare(b.name, "ru"));
  const withCost = items.some((i) => i.unitCost != null);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Заказ");
  ws.addRow([`Заказ ${o.number} от Abramov Shop`]).font = { bold: true, size: 13 };
  if (o.note) ws.addRow([o.note]);
  ws.addRow([]);
  const head = ws.addRow(["№", "Код поставщика", "Наименование", "Кол-во, шт", ...(withCost ? ["Цена, ₽", "Сумма, ₽"] : [])]);
  head.font = { bold: true };
  for (const [n, i] of items.entries()) {
    const r = ws.addRow([n + 1, i.supplierCode ?? "", i.name, i.qty, ...(withCost ? [i.unitCost != null ? i.unitCost / 100 : null, i.unitCost != null ? (i.unitCost * i.qty) / 100 : null] : [])]);
    // Код — текстом: «01851» не должен стать числом 1851
    r.getCell(2).numFmt = "@";
    r.getCell(2).value = i.supplierCode ?? "";
  }
  const units = items.reduce((a, i) => a + i.qty, 0);
  ws.addRow([]);
  ws.addRow(["", "", "Итого", units, ...(withCost ? ["", items.every((i) => i.unitCost != null) ? items.reduce((a, i) => a + i.qty * (i.unitCost ?? 0), 0) / 100 : ""] : [])]).font = { bold: true };
  ws.columns = [{ width: 5 }, { width: 16 }, { width: 60 }, { width: 11 }, { width: 12 }, { width: 14 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="zakaz-${o.number}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
