/**
 * GET /admin/stock/labels/niimbot?i=<variantId>:<копий>,…&p=1 — таблица для приложения NIIMBOT.
 * Принтер NIIMBOT печатает только из своего приложения: там «Источник данных» → Excel, и поля этикетки
 * (текст, штрихкод, QR) привязываются к колонкам. Одна строка — одна этикетка, копии — повтор строки.
 * Простой лист без оформления: приложение капризно к сложным файлам.
 */
import ExcelJS from "exceljs";
import { rub } from "@/lib/format";
import { labelItems, parseLabelQuery } from "@/lib/labels";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return new Response("Нет доступа", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const items = await labelItems(parseLabelQuery(sp.get("i") ?? ""));
  const withPrice = sp.get("p") !== "0";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Этикетки");
  const head = ["Название", ...(withPrice ? ["Цена"] : []), "Штрихкод", "Ссылка"];
  ws.addRow(head);
  for (const it of items) {
    const name = it.variant ? `${it.name}, ${it.variant}` : it.name;
    const row = [name, ...(withPrice ? [rub(it.price).replace(/ /g, " ")] : []), it.code, it.url];
    for (let k = 0; k < it.copies; k++) ws.addRow(row);
  }
  // Всё — текстом, чтобы артикул вроде 0007 не превратился в число
  ws.eachRow((r) => r.eachCell((c) => (c.numFmt = "@")));
  const widths: Record<string, number> = { Название: 40, Цена: 12, Штрихкод: 16, Ссылка: 50 };
  ws.columns.forEach((c, i) => (c.width = widths[head[i]] ?? 20));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="niimbot-etiketki.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
