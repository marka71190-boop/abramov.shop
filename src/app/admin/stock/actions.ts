"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { applyMoves, withStockNotices } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";

const In = z.object({
  type: z.enum(["RECEIPT", "WRITE_OFF", "INVENTORY"]),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        qty: z.number().int().min(0).max(100_000),
        unitCost: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
      }),
    )
    .min(1, "Добавьте хотя бы один товар")
    .max(300),
});

export type MoveResult = { ok?: string; error?: string };

export async function saveMoves(raw: unknown): Promise<MoveResult> {
  const me = await requireAdmin();
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте строки" };
  const { type, lines } = p.data;
  if (type !== "INVENTORY" && lines.some((l) => l.qty < 1)) return { error: "Количество — от 1 шт" };
  if (new Set(lines.map((l) => l.variantId)).size !== lines.length) return { error: "Один и тот же товар добавлен дважды — объедините строки" };
  if (type === "WRITE_OFF" && !p.data.note) return { error: "Укажите причину списания" };
  try {
    const done = await withStockNotices(
      lines.map((l) => l.variantId),
      () => applyMoves(me.id, type, lines, p.data.note || null),
    );
    await audit(me.id, `stock.${type.toLowerCase()}`, "product_variant", null, { lines: done.length, units: done.reduce((a, d) => a + d.qty, 0) });
    revalidatePath("/", "layout");
    const units = done.reduce((a, d) => a + Math.abs(d.qty), 0);
    return {
      ok:
        type === "RECEIPT"
          ? `Приход проведён: ${done.length} поз., ${units} шт`
          : type === "WRITE_OFF"
            ? `Списано: ${units} шт`
            : done.length
              ? `Остатки исправлены: ${done.length} поз.`
              : "Расхождений нет — всё сходится",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не получилось сохранить" };
  }
}
