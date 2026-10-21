"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { addStage, ProductionError } from "@/lib/production";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../../actions";

const In = z.object({
  orderId: z.string().min(1).max(64),
  stage: z.enum(["IN_WORK", "READY"]),
  note: z.string().max(1000, "Комментарий — до 1000 символов").optional(),
  photo: z.string().max(500).optional(),
});

export async function productionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  try {
    await addStage(d.orderId, d.stage, { note: d.note, photo: d.photo, actorId: me.id });
  } catch (e) {
    if (e instanceof ProductionError) return { error: e.message };
    throw e;
  }
  await audit(me.id, `production.${d.stage.toLowerCase()}`, "order", d.orderId, { photo: !!d.photo });
  revalidatePath(`/admin/orders/${d.orderId}`);
  return { ok: d.stage === "READY" ? "Отмечено: кий готов — покупателю ушло письмо" : "Отмечено — покупателю ушло письмо" };
}
