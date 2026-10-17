/** GET /admin/catalog/export — весь каталог в Excel, в формате для обратной загрузки. */
import { audit } from "@/lib/audit";
import { exportXlsx } from "@/lib/catalog-import";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return new Response("Нет доступа", { status: 403 });
  const buf = await exportXlsx();
  await audit(me.id, "catalog.export", "product", null);
  const stamp = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="abramov-shop-katalog-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
