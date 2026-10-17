"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { saveHomeContent } from "@/lib/home-content";
import { HOME_FIELDS } from "@/lib/home-content-fields";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

export async function saveHomeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const values: Record<string, string> = {};
  for (const f of HOME_FIELDS) {
    const v = String(form.get(f.key) ?? "");
    if (v.length > f.max + 50) return { error: `«${f.label}» — не длиннее ${f.max} символов` };
    values[f.key] = v;
  }
  await saveHomeContent(values);
  await audit(me.id, "home.update", "setting", "home");
  revalidatePath("/");
  return { ok: "Сохранено — главная страница обновлена" };
}
