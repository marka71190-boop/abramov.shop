"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { applyMoves, withStockNotices } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";

const In = z.object({
  type: z.enum(["RECEIPT", "WRITE_OFF", "INVENTORY"]),
  clubId: z.string().max(64).nullish(), // клуб со своим учётом; пусто — склад
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
      () => applyMoves(me.id, type, lines, p.data.note || null, p.data.clubId || null),
    );
    await audit(me.id, `stock.${type.toLowerCase()}`, "product_variant", null, { lines: done.length, units: done.reduce((a, d) => a + d.qty, 0), club: p.data.clubId || undefined });
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

// ---------------------------------------------------------------- остатки по клубам

const TransferIn = z.object({
  from: z.string().max(64).nullable(), // null — склад
  to: z.string().max(64).nullable(),
  note: z.string().trim().max(200).optional(),
  lines: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(100_000) })).min(1, "Добавьте товар").max(300),
});

export async function transferAction(raw: unknown): Promise<MoveResult> {
  const me = await requireAdmin();
  const p = TransferIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте строки" };
  const { transferStock, StockError } = await import("@/lib/club-stock");
  try {
    const done = await withStockNotices(
      p.data.lines.map((l) => l.variantId),
      () => transferStock(me.id, p.data.from, p.data.to, p.data.lines, p.data.note || null),
    );
    await audit(me.id, "stock.transfer", "product_variant", null, { from: p.data.from, to: p.data.to, lines: done.length, units: done.reduce((a, d) => a + d.qty, 0) });
    revalidatePath("/", "layout");
    return { ok: `Перемещено: ${done.length} поз., ${done.reduce((a, d) => a + d.qty, 0)} шт` };
  } catch (e) {
    return { error: e instanceof StockError ? e.message : e instanceof Error ? e.message : "Не получилось переместить" };
  }
}

export async function ownStockAction(clubId: string, on: boolean): Promise<MoveResult> {
  const me = await requireAdmin("OWNER");
  const { setOwnStock, StockError } = await import("@/lib/club-stock");
  try {
    await setOwnStock(String(clubId).slice(0, 64), !!on);
    await audit(me.id, on ? "stock.club_on" : "stock.club_off", "club", clubId);
    revalidatePath("/admin/stock/clubs");
    revalidatePath("/kassa");
    return { ok: on ? "Учёт клуба включён — привезите товар перемещением со склада" : "Учёт клуба выключен — касса клуба снова продаёт со склада" };
  } catch (e) {
    return { error: e instanceof StockError ? e.message : "Не получилось" };
  }
}

const NormsIn = z.object({
  clubId: z.string().min(1).max(64),
  norms: z.record(z.string().max(64), z.number().int().min(0).max(10_000).nullable()),
});

/** Нормы клуба: сколько держать на полке — по ним приходит «заканчивается в клубе» */
export async function normsAction(raw: unknown): Promise<MoveResult> {
  const me = await requireAdmin();
  const p = NormsIn.safeParse(raw);
  if (!p.success) return { error: "Проверьте нормы — целые числа от 0" };
  try {
    const { setClubNorms, checkClubLow } = await import("@/lib/club-low");
    const n = await setClubNorms(p.data.clubId, p.data.norms);
    await audit(me.id, "stock.club_norms", "club", p.data.clubId, { lines: n });
    void checkClubLow(Object.keys(p.data.norms)).catch(() => 0);
    revalidatePath("/admin/stock/refill");
    return { ok: n ? `Нормы сохранены: ${n} поз.` : "Нечего сохранять" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не получилось сохранить" };
  }
}
