"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

/** Процент сотруднику с продаж в кассе — только владелец */
export async function staffPercentAction(fd: FormData) {
  const me = await requireAdmin("OWNER");
  const v = Math.round(Number(String(fd.get("percent") ?? "").replace(",", ".")) * 10) / 10;
  if (!(v >= 0 && v <= 50)) return;
  const cur = await getSettings();
  await saveSettings({ ...cur, finance: { ...cur.finance, staffPercent: v } });
  await audit(me.id, "settings.staff_percent", "settings", null, { percent: v });
  revalidatePath("/admin/pos/staff");
}
