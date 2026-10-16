/** «Мои адреса»: карточки доставки покупателя (до 5). */
import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { cdekEnabled } from "@/lib/cdek";
import { normalizePhone } from "@/lib/format";

export const MAX_ADDRESSES = 5;
export type SavedAddress = typeof s.address.$inferSelect;

export const AddressIn = z.object({
  id: z.string().max(64).nullish(),
  label: z.string().trim().min(1, "Назовите адрес, например «Дом»").max(30),
  deliveryType: z.enum(["PVZ", "COURIER"]),
  city: z.string().trim().min(2, "Выберите город").max(120),
  cdekCityCode: z.number().int().positive().nullish(),
  address: z.string().trim().max(300),
  postalCode: z.string().trim().max(12).nullish(),
  cdekPvzCode: z.string().trim().max(40).nullish(),
  recipientName: z.string().trim().min(2, "Укажите ФИО получателя").max(120),
  recipientPhone: z.string().trim().max(40),
  note: z.string().trim().max(300).nullish(),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof AddressIn>;

export function listAddresses(userId: string) {
  return db.query.address.findMany({
    where: eq(s.address.userId, userId),
    orderBy: [desc(s.address.isDefault), desc(sql`coalesce(${s.address.lastUsedAt}, ${s.address.createdAt})`), asc(s.address.label)],
  });
}

/** Проверка и сохранение. Возвращает текст ошибки или сохранённый адрес. */
export async function saveAddress(userId: string, raw: unknown): Promise<{ error: string } | { address: SavedAddress }> {
  const p = AddressIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const d = p.data;
  const phone = normalizePhone(d.recipientPhone);
  if (!phone) return { error: "Проверьте телефон получателя: нужен российский номер" };
  if (cdekEnabled() && !d.cdekCityCode) return { error: "Выберите город из списка" };
  if (d.deliveryType === "PVZ" && cdekEnabled() && !d.cdekPvzCode) return { error: "Выберите пункт выдачи СДЭК" };
  if (d.deliveryType === "COURIER" && d.address.length < 5) return { error: "Укажите улицу, дом и квартиру" };

  const values = {
    label: d.label,
    deliveryType: d.deliveryType,
    city: d.city,
    cdekCityCode: d.cdekCityCode ?? null,
    address: d.address || d.city,
    postalCode: d.postalCode || null,
    cdekPvzCode: d.deliveryType === "PVZ" ? d.cdekPvzCode || null : null,
    recipientName: d.recipientName,
    recipientPhone: phone,
    note: d.note || null,
  };

  return db.transaction(async (tx) => {
    let row: SavedAddress | undefined;
    if (d.id) {
      [row] = await tx
        .update(s.address)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(s.address.id, d.id), eq(s.address.userId, userId)))
        .returning();
      if (!row) return { error: "Адрес не найден — обновите страницу" };
    } else {
      // Лимит считаем под блокировкой пользователя, чтобы две вкладки не обошли его
      await tx.execute(sql`select 1 from "user" where id = ${userId} for update`);
      const n = await tx.$count(s.address, eq(s.address.userId, userId));
      if (n >= MAX_ADDRESSES) return { error: `Можно сохранить до ${MAX_ADDRESSES} адресов — удалите ненужный` };
      [row] = await tx.insert(s.address).values({ ...values, userId, isDefault: n === 0 }).returning();
    }
    if (d.isDefault && !row.isDefault) row = await makeDefault(tx, userId, row.id);
    return { address: row };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function makeDefault(tx: Tx, userId: string, id: string) {
  await tx.update(s.address).set({ isDefault: false }).where(and(eq(s.address.userId, userId), ne(s.address.id, id)));
  const [row] = await tx.update(s.address).set({ isDefault: true }).where(and(eq(s.address.id, id), eq(s.address.userId, userId))).returning();
  return row;
}

export async function setDefaultAddress(userId: string, id: string) {
  await db.transaction((tx) => makeDefault(tx, userId, id));
}

export async function deleteAddress(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [gone] = await tx.delete(s.address).where(and(eq(s.address.id, id), eq(s.address.userId, userId))).returning();
    // Удалили основной — основным становится последний использованный
    if (gone?.isDefault) {
      const [next] = await tx
        .select({ id: s.address.id })
        .from(s.address)
        .where(eq(s.address.userId, userId))
        .orderBy(desc(sql`coalesce(${s.address.lastUsedAt}, ${s.address.createdAt})`))
        .limit(1);
      if (next) await makeDefault(tx, userId, next.id);
    }
  });
}

export async function touchAddress(userId: string, id: string) {
  await db.update(s.address).set({ lastUsedAt: new Date() }).where(and(eq(s.address.id, id), eq(s.address.userId, userId)));
}
