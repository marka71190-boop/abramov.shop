"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { setBins } from "@/lib/bins";
import { requireAdmin } from "@/lib/viewer";

const In = z.record(z.string().min(1).max(64), z.string().max(40).nullable());

/** Разложить товары по ячейкам: variantId → код («A-3»); пусто — убрать из ячейки */
export async function saveBinsAction(raw: unknown): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const p = In.safeParse(raw);
  if (!p.success) return { error: "Проверьте коды ячеек" };
  try {
    const n = await setBins(p.data);
    if (n) await audit(me.id, "stock.bins", "product_variant", null, { lines: n });
    revalidatePath("/admin/stock", "layout");
    return { ok: n ? `Сохранено: ${n} поз.` : "Ничего не изменилось" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не получилось сохранить" };
  }
}
