/** Клубы сети «Чемпион» и «Абрамов»: самовывоз и приём киёв в мастерскую */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

export type ClubRow = typeof s.club.$inferSelect;

/** Открытые клубы: для самовывоза или для мастерской */
export async function listClubs(opts: { pickup?: boolean; service?: boolean } = {}) {
  return db.query.club.findMany({
    where: and(
      eq(s.club.isActive, true),
      opts.pickup ? eq(s.club.pickup, true) : undefined,
      opts.service ? eq(s.club.service, true) : undefined,
    ),
    orderBy: [asc(s.club.city), asc(s.club.sortOrder), asc(s.club.name)],
  });
}

export async function getClub(id: string | null | undefined) {
  if (!id) return null;
  return (await db.query.club.findFirst({ where: eq(s.club.id, id) })) ?? null;
}

/** Ссылка «Как добраться» в Яндекс Картах */
export function clubMapUrl(c: Pick<ClubRow, "lat" | "lon" | "city" | "address" | "name">) {
  return c.lat != null && c.lon != null
    ? `https://yandex.ru/maps/?pt=${c.lon},${c.lat}&z=17&l=map`
    : `https://yandex.ru/maps/?text=${encodeURIComponent(`${c.city}, ${c.address}`)}`;
}

/** Для покупателя: «Клуб «Чемпион», Краснодар, ул. Красная, 1» */
export const clubLine = (c: Pick<ClubRow, "name" | "city" | "address">) => `${c.name}, ${c.city}, ${c.address}`;
