import type { SiteSettings, TierKey } from "@/lib/settings-defaults";

const ORDER: TierKey[] = ["SILVER", "GOLD", "BLACK"];
export const TIER_NAME: Record<TierKey, string> = { SILVER: "Silver", GOLD: "Gold", BLACK: "Black" };

/** Уровень по сумме покупок (в рублях) и прогресс до следующего. */
export function tierProgress(totalSpentRub: number, loyalty: SiteSettings["loyalty"]) {
  let current: TierKey = "SILVER";
  for (const t of ORDER) if (totalSpentRub >= loyalty.tiers[t].threshold) current = t;
  const idx = ORDER.indexOf(current);
  const next = ORDER[idx + 1] ?? null;
  if (!next) return { current, next: null, left: 0, percent: 100 };
  const from = loyalty.tiers[current].threshold;
  const to = loyalty.tiers[next].threshold;
  const percent = Math.max(0, Math.min(100, ((totalSpentRub - from) / Math.max(1, to - from)) * 100));
  return { current, next, left: Math.max(0, to - totalSpentRub), percent };
}

/** Короткий реферальный код без похожих символов (0/O, 1/I). */
export function makeReferralCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += abc[b % abc.length];
  return `AS-${out}`;
}
