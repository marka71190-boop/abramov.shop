"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { addPassportEvent, createPassport, detachOwner, PassportError, updatePassport } from "@/lib/cue-passport";
import { requireAdmin } from "@/lib/viewer";

export type FormState = { ok?: string; error?: string };

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const date = (v: string) => {
  const d = v ? new Date(`${v}T12:00:00+03:00`) : new Date();
  return Number.isNaN(+d) ? new Date() : d;
};

/** Выпустить паспорт */
export async function createPassportAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const ids: string[] = [];
  try {
    const orderId = str(form, "orderId", 64) || null;
    const order = orderId ? await db.query.order.findFirst({ where: eq(s.order.id, orderId), columns: { id: true, userId: true } }) : null;
    // Несколько одинаковых киёв — каждому свой номер и паспорт (из заказа — всегда один)
    const qty = order ? 1 : Math.max(1, Math.min(50, Math.trunc(Number(form.get("qty") ?? 1)) || 1));
    const input = {
      model: str(form, "model", 160),
        spec: str(form, "spec"),
        master: str(form, "master", 80),
        madeAt: date(str(form, "madeAt", 10)),
        warrantyMonths: Number(form.get("warrantyMonths") ?? 12),
        photo: str(form, "photo", 300) || null,
        orderId: order?.id ?? null,
        orderItemId: order ? str(form, "orderItemId", 64) || null : null,
        ownerId: order?.userId ?? null,
    };
    for (let i = 0; i < qty; i++) ids.push((await createPassport(input, me.id)).id);
  } catch (e) {
    if (e instanceof PassportError) return { error: e.message };
    throw e;
  }
  redirect(ids.length === 1 ? `/admin/passports/${ids[0]}?created=1` : `/admin/passports?new=${ids.join(",")}`);
}

export async function updatePassportAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id", 64);
  const model = str(form, "model", 160);
  if (!model) return { error: "Укажите модель кия" };
  await updatePassport(id, {
    model,
    spec: str(form, "spec") || null,
    master: str(form, "master", 80) || null,
    madeAt: date(str(form, "madeAt", 10)),
    warrantyMonths: Math.max(0, Math.min(120, Math.trunc(Number(form.get("warrantyMonths") ?? 12)) || 0)),
    photo: str(form, "photo", 300) || null,
  });
  revalidatePath(`/admin/passports/${id}`);
  return { ok: "Сохранено" };
}

export async function addEventAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id", 64);
  try {
    await addPassportEvent(id, form.get("kind") === "NOTE" ? "NOTE" : "SERVICE", str(form, "text", 300), str(form, "service", 30) || null);
  } catch (e) {
    if (e instanceof PassportError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/admin/passports/${id}`);
  return { ok: "Запись добавлена — её видно в паспорте" };
}

export async function statusAction(id: string, status: "ACTIVE" | "VOID") {
  await requireAdmin("OWNER");
  await updatePassport(String(id).slice(0, 64), { status });
  revalidatePath(`/admin/passports/${id}`);
}

export async function detachAction(id: string) {
  await requireAdmin("OWNER");
  await detachOwner(String(id).slice(0, 64));
  revalidatePath(`/admin/passports/${id}`);
}
