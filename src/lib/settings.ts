import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { mergeSettings, type SiteSettings } from "@/lib/settings-defaults";

export const getSettings = cache(async (): Promise<SiteSettings> => {
  const row = await db.query.setting.findFirst({ where: eq(s.setting.key, "site") });
  return mergeSettings(row?.value);
});

export async function saveSettings(next: SiteSettings) {
  await db
    .insert(s.setting)
    .values({ key: "site", value: next })
    .onConflictDoUpdate({ target: s.setting.key, set: { value: next, updatedAt: new Date() } });
}
