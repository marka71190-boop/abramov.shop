/** POST /api/admin/catalog-import — проверка файла Excel: что создастся, что обновится, ошибки. Ничего не меняет. */
import { buildPlan, readWorkbook } from "@/lib/catalog-import";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(await getViewer())) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Файл больше 10 МБ" }, { status: 400 });
  const { rows, error } = await readWorkbook(Buffer.from(await file.arrayBuffer()));
  if (error) return Response.json({ error }, { status: 400 });
  if (!rows.length) return Response.json({ error: "В таблице нет строк с товарами" }, { status: 400 });
  return Response.json(await buildPlan(rows));
}
