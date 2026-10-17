/** GET /admin/catalog/template — пустой шаблон каталога в Excel. */
import { templateXlsx } from "@/lib/catalog-import";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdmin(await getViewer())) return new Response("Нет доступа", { status: 403 });
  return new Response(new Uint8Array(await templateXlsx()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="abramov-shop-shablon-kataloga.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
