/** POST /api/media — фото к отзыву (для вошедших покупателей, не больше 20 в час). */
import { saveImage } from "@/lib/media-upload";
import { createRateLimiter } from "@/lib/rate-limit";
import { getActiveBan, getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const limit = createRateLimiter({ limit: 20, windowMs: 3600_000 });

export async function POST(request: Request) {
  const me = await getViewer();
  if (!me || getActiveBan(me)) return Response.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!limit(me.id)) return Response.json({ error: "Слишком много фото, попробуйте позже" }, { status: 429 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Файл не получен" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Фото больше 10 МБ" }, { status: 400 });
  try {
    return Response.json({ url: await saveImage(file, me.id, 1280) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Не удалось обработать фото" }, { status: 400 });
  }
}
