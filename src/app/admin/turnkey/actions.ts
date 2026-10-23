"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { saveTurnkey, TURNKEY_STATUS } from "@/lib/turnkey";
import { mergeTurnkey } from "@/lib/turnkey-config";
import { requireAdmin } from "@/lib/viewer";

export async function saveTurnkeyConfig(raw: unknown): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin("OWNER");
  const c = mergeTurnkey(raw);
  if (!c.models.length) return { error: "Добавьте хотя бы одну модель стола" };
  await saveTurnkey(c);
  await audit(me.id, "turnkey.settings", "setting", "turnkey");
  revalidatePath("/klub-pod-klyuch");
  revalidatePath("/admin/turnkey/settings");
  return { ok: "Сохранено" };
}

export async function updateTurnkeyRequest(id: string, status: string, note: string): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  if (!(status in TURNKEY_STATUS)) return { error: "Неизвестный статус" };
  await db.update(s.turnkeyRequest).set({ status, adminNote: note.trim().slice(0, 4000) || null, updatedAt: new Date() }).where(eq(s.turnkeyRequest.id, id));
  await audit(me.id, "turnkey.update", "turnkey", id, { status });
  revalidatePath(`/admin/turnkey/${id}`);
  revalidatePath("/admin/turnkey");
  return { ok: "Сохранено" };
}
