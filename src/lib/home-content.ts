import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { HOME_FIELDS, mergeHome, type HomeContent } from "@/lib/home-content-fields";

const KEY = "home";

export const getHomeContent = cache(async (): Promise<HomeContent> => {
  const row = await db.query.setting.findFirst({ where: eq(s.setting.key, KEY) });
  return mergeHome(row?.value);
});

/** Сохраняем только изменённые поля: если текст совпадает с умолчанием — не храним (обновления умолчаний доходят до сайта). */
export async function saveHomeContent(values: Record<string, string>) {
  const stored: Record<string, string> = {};
  for (const f of HOME_FIELDS) {
    const v = (values[f.key] ?? "").replace(/\r\n/g, "\n").trim().slice(0, f.max);
    if (v && v !== f.def) stored[f.key] = v;
  }
  await db
    .insert(s.setting)
    .values({ key: KEY, value: stored })
    .onConflictDoUpdate({ target: s.setting.key, set: { value: stored, updatedAt: new Date() } });
}
