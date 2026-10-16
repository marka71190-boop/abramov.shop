"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { purgePersonalData } from "@/lib/pd-purge";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

const PURGE_PHRASE = "УДАЛИТЬ";

export async function purgeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== PURGE_PHRASE) return { error: `Впишите слово ${PURGE_PHRASE}` };
  if (!(await getSettings()).pdPause) return { error: "Сначала включите паузу приёма заказов выше и сохраните — иначе данные сразу начнут собираться снова" };
  try {
    const r = await purgePersonalData(me.id);
    await audit(me.id, "pd.purge", "user", null, r);
    revalidatePath("/admin", "layout");
    return {
      ok: `Готово: удалено аккаунтов — ${r.users}, записей о согласиях — ${r.consents}, отзывов — ${r.reviews}; обезличено заказов — ${r.orders}, заявок на возврат — ${r.returns}`,
    };
  } catch (e) {
    console.error("[pd] purge:", e);
    return { error: "Не получилось — ничего не удалено. Попробуйте ещё раз" };
  }
}
