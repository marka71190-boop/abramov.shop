"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

const coord = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v ? Number(v.replace(",", ".")) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= min && v <= max), "Координаты — числом, например 45.0355");

const In = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(2, "Название клуба").max(120),
  city: z.string().trim().min(2, "Город").max(80),
  address: z.string().trim().min(3, "Адрес").max(200),
  workTime: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).default(""),
  lat: coord(-90, 90),
  lon: coord(-180, 180),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});

export async function saveClub(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const values = {
    name: d.name,
    city: d.city,
    address: d.address,
    workTime: d.workTime,
    phone: d.phone || null,
    note: d.note,
    lat: d.lat,
    lon: d.lon,
    sortOrder: d.sortOrder,
    pickup: form.get("pickup") === "on",
    service: form.get("service") === "on",
    isActive: form.get("isActive") === "on",
  };
  let id = d.id;
  if (id) await db.update(s.club).set(values).where(eq(s.club.id, id));
  else id = (await db.insert(s.club).values(values).returning({ id: s.club.id }))[0].id;
  await audit(me.id, d.id ? "club.update" : "club.create", "club", id, { name: d.name });
  revalidatePath("/", "layout");
  if (!d.id) redirect(`/admin/clubs/${id}?saved=1`);
  return { ok: "Сохранено" };
}

export async function deleteClub(id: string) {
  const me = await requireAdmin("OWNER");
  await db.delete(s.club).where(eq(s.club.id, id));
  await audit(me.id, "club.delete", "club", id);
  revalidatePath("/", "layout");
  redirect("/admin/clubs");
}
