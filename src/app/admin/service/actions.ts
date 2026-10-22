"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { billService, markServicePaidOffline, ServiceError, setServiceStatus, updateServiceTerms } from "@/lib/service";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

const rubToKop = (v?: string | null) => (v?.trim() ? Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) : null);
const mskDay = (v?: string | null) => (v ? new Date(`${v}T12:00:00+03:00`) : null);

const StageIn = z.object({
  id: z.string().min(1).max(64),
  op: z.enum(["RECEIVED", "IN_WORK", "READY", "DONE", "CANCELLED", "terms", "bill", "paid"]),
  note: z.string().max(1000).optional(),
  photo: z.string().max(500).optional(),
  price: z.string().max(20).optional(),
  readyBy: z.string().max(10).optional(),
});

export async function serviceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = StageIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const price = rubToKop(d.price);
  if (price != null && !(price >= 0)) return { error: "Цена — числом в рублях" };
  const readyBy = mskDay(d.readyBy);
  try {
    if (d.op === "terms") {
      await updateServiceTerms(d.id, price, readyBy);
    } else if (d.op === "bill") {
      if (price != null || readyBy) await updateServiceTerms(d.id, price, readyBy);
      await billService(d.id);
    } else if (d.op === "paid") {
      await markServicePaidOffline(d.id, me.id);
    } else {
      await setServiceStatus(d.id, d.op, { note: d.note, photo: d.photo, price, readyBy: d.readyBy !== undefined ? readyBy : undefined, actorId: me.id });
    }
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    if (e instanceof Error && /ЮKassa/.test(e.message)) return { error: e.message };
    throw e;
  }
  await audit(me.id, `service.${d.op.toLowerCase()}`, "service", d.id);
  revalidatePath(`/admin/service/${d.id}`);
  revalidatePath("/admin/service");
  const ok: Record<string, string> = {
    terms: "Цена и срок сохранены",
    bill: "Счёт отправлен покупателю на почту",
    paid: "Отмечено: оплачено на месте",
    CANCELLED: "Заявка отменена — покупателю ушло письмо",
  };
  return { ok: ok[d.op] ?? "Отмечено — покупателю ушло письмо" };
}

// ---------- Прайс

const ItemIn = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Название услуги").max(120),
  description: z.string().trim().max(300).default(""),
  price: z.string().max(20),
  days: z.coerce.number().int().min(0).max(365),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});

export async function saveServiceItem(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = ItemIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const price = rubToKop(d.price);
  if (price == null || !(price >= 0)) return { error: "Цена — числом в рублях" };
  const values = {
    name: d.name,
    description: d.description,
    price,
    days: d.days,
    sortOrder: d.sortOrder,
    priceFrom: form.get("priceFrom") === "on",
    isActive: form.get("isActive") === "on",
  };
  if (d.id) await db.update(s.serviceItem).set(values).where(eq(s.serviceItem.id, d.id));
  else await db.insert(s.serviceItem).values(values);
  await audit(me.id, "service.price", "service_item", d.id ?? null, { name: d.name });
  revalidatePath("/admin/service/prices");
  revalidatePath("/service");
  return { ok: d.id ? "Сохранено" : "Услуга добавлена" };
}

export async function deleteServiceItem(id: string) {
  const me = await requireAdmin("OWNER");
  await db.delete(s.serviceItem).where(eq(s.serviceItem.id, id));
  await audit(me.id, "service.price_delete", "service_item", id);
  revalidatePath("/admin/service/prices");
  revalidatePath("/service");
}

const SettingsIn = z.object({
  cdekAddress: z.string().trim().max(500),
  intro: z.string().trim().max(600),
});

export async function saveServiceSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = SettingsIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const cur = await getSettings();
  await saveSettings({ ...cur, service: { enabled: form.get("enabled") === "on", cdekAddress: p.data.cdekAddress, intro: p.data.intro } });
  await audit(me.id, "settings.service", "setting", "site");
  revalidatePath("/service");
  return { ok: "Сохранено" };
}
