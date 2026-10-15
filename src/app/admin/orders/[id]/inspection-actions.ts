"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { trashFile } from "@/lib/gdrive";
import { notifyChecked } from "@/lib/inspection";
import { requireAdmin } from "@/lib/viewer";

type State = { error?: string; ok?: string };

const In = z.object({
  orderId: z.string().max(64),
  serialNumber: z.string().trim().max(80).default(""),
  sealNumber: z.string().trim().max(80).default(""),
  note: z.string().trim().max(1000).default(""),
  checklist: z.array(z.string().max(120)).max(30).default([]),
});

export async function saveInspection(input: z.input<typeof In>): Promise<State> {
  const me = await requireAdmin();
  const p = In.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const values = { serialNumber: d.serialNumber || null, sealNumber: d.sealNumber || null, note: d.note || null, checklist: d.checklist, updatedAt: new Date() };
  await db
    .insert(s.orderInspection)
    .values({ orderId: d.orderId, ...values })
    .onConflictDoUpdate({ target: s.orderInspection.orderId, set: values });
  await audit(me.id, "order.inspection", "order", d.orderId, { serial: d.serialNumber, seal: d.sealNumber, checklist: d.checklist.length });
  revalidatePath(`/admin/orders/${d.orderId}`);
  return { ok: "Сохранено" };
}

/** «Проверено» — покупатель видит фото и видео и получает письмо. */
export async function markInspected(orderId: string): Promise<State> {
  const me = await requireAdmin();
  const media = await db.$count(s.inspectionMedia, eq(s.inspectionMedia.orderId, orderId));
  if (!media) return { error: "Сначала загрузите хотя бы одно фото или видео" };
  const [row] = await db
    .update(s.orderInspection)
    .set({ checkedAt: new Date(), checkedById: me.id, updatedAt: new Date() })
    .where(eq(s.orderInspection.orderId, orderId))
    .returning();
  if (!row) return { error: "Сначала загрузите фото и видео" };
  await audit(me.id, "order.inspected", "order", orderId);
  void notifyChecked(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Отмечено — покупатель получил письмо с фото и видео" };
}

/** Удалить файл можно только до отметки «Проверено» — потом это доказательство. */
export async function deleteInspectionMedia(mediaId: string): Promise<State> {
  const me = await requireAdmin();
  const m = await db.query.inspectionMedia.findFirst({ where: eq(s.inspectionMedia.id, mediaId) });
  if (!m) return { error: "Файл не найден" };
  const insp = await db.query.orderInspection.findFirst({ where: eq(s.orderInspection.orderId, m.orderId) });
  if (insp?.checkedAt && !m.returnId) return { error: "После отметки «Проверено» файлы не удаляются — это доказательство для покупателя" };
  await trashFile(m.driveFileId).catch((e) => console.error("[gdrive] trash:", e instanceof Error ? e.message : e));
  await db.delete(s.inspectionMedia).where(and(eq(s.inspectionMedia.id, mediaId)));
  await audit(me.id, "order.inspection_delete", "order", m.orderId, { file: m.name });
  revalidatePath(`/admin/orders/${m.orderId}`);
  return { ok: "Удалено" };
}
