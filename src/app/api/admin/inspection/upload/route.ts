import { NextResponse } from "next/server";
import { z } from "zod";
import { beginUpload } from "@/lib/inspection";
import { getViewer, isAdmin } from "@/lib/viewer";

const In = z.object({
  orderId: z.string().max(64),
  returnId: z.string().max(64).nullish(),
  name: z.string().max(200),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

/** Начало загрузки фото или видео проверки на Google Диск. */
export async function POST(req: Request) {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const p = In.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  try {
    return NextResponse.json(await beginUpload({ ...p.data, userId: me.id }));
  } catch (e) {
    console.error("[inspection] begin:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось начать загрузку" }, { status: 400 });
  }
}
