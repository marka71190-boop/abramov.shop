/** «Клуб под ключ» — серверная часть: прайс в базе, заявки */
import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { mergeTurnkey, type TurnkeyConfig } from "@/lib/turnkey-config";

const KEY = "turnkey";

export const getTurnkey = cache(async (): Promise<TurnkeyConfig> => {
  const row = await db.query.setting.findFirst({ where: eq(s.setting.key, KEY) });
  return mergeTurnkey(row?.value);
});

export async function saveTurnkey(c: TurnkeyConfig) {
  await db
    .insert(s.setting)
    .values({ key: KEY, value: c })
    .onConflictDoUpdate({ target: s.setting.key, set: { value: c, updatedAt: new Date() } });
}

export function turnkeyNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `KL-${day}-${tail}`;
}

export const TURNKEY_STATUS = {
  NEW: { text: "Новая", tone: "gold" },
  IN_WORK: { text: "В работе", tone: "gold" },
  OFFER: { text: "КП отправлено", tone: "ok" },
  WON: { text: "Договор", tone: "ok" },
  LOST: { text: "Отказ", tone: "bad" },
} as const;
export type TurnkeyStatus = keyof typeof TURNKEY_STATUS;
