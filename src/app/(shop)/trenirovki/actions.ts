"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRateLimiter } from "@/lib/rate-limit";
import { bookSlot, BookingError, cancelBookingByUser } from "@/lib/trainings";
import { getActiveBan, getViewer } from "@/lib/viewer";

const limit = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export async function bookTraining(slotId: string, comment: string): Promise<{ ok?: string; error?: string; login?: boolean }> {
  const me = await getViewer();
  if (!me) return { login: true, error: "Войдите, чтобы записаться" };
  if (getActiveBan(me)) return { error: "Запись недоступна" };
  if (!limit(me.id)) return { error: "Слишком часто — попробуйте через несколько минут" };
  const p = z.object({ slotId: z.string().min(1).max(64), comment: z.string().max(500) }).safeParse({ slotId, comment });
  if (!p.success) return { error: "Проверьте данные" };
  try {
    await bookSlot(me.id, p.data.slotId, p.data.comment.trim());
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    // Двойной клик: уникальный индекс не даст записаться дважды
    if (e instanceof Error && /unique|duplicate/i.test(e.message + String((e as { cause?: unknown }).cause))) return { error: "Вы уже записаны на эту тренировку" };
    throw e;
  }
  revalidatePath("/trenirovki", "layout");
  revalidatePath("/account");
  return { ok: "Вы записаны! Подтверждение — на почте, напомним накануне" };
}

export async function cancelMyTraining(bookingId: string): Promise<{ ok?: string; error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Войдите в аккаунт" };
  try {
    await cancelBookingByUser(me.id, bookingId);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/trenirovki", "layout");
  revalidatePath("/account");
  return { ok: "Запись отменена" };
}
