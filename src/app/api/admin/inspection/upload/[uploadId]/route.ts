import { NextResponse, type NextRequest } from "next/server";
import { putChunk } from "@/lib/inspection";
import { getViewer, isAdmin } from "@/lib/viewer";

export const maxDuration = 300;

/** Очередной кусок файла (до 8 МБ): сайт передаёт его на Google Диск. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const { uploadId } = await params;
  const offset = Number(req.nextUrl.searchParams.get("offset"));
  const data = new Uint8Array(await req.arrayBuffer());
  if (!Number.isInteger(offset) || offset < 0 || !data.byteLength || data.byteLength > 8 * 1024 * 1024)
    return NextResponse.json({ error: "Неверный кусок файла" }, { status: 400 });
  try {
    return NextResponse.json(await putChunk(uploadId, me.id, offset, data));
  } catch (e) {
    console.error("[inspection] chunk:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка загрузки" }, { status: 400 });
  }
}
