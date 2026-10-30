"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { normalizePhone } from "@/lib/format";
import { createRateLimiter } from "@/lib/rate-limit";
import { bookSlot, BookingError, cancelBookingByUser, requestTraining } from "@/lib/trainings";
import { recordConsent } from "@/lib/consent";
import { getRequestMeta } from "@/lib/request";
import { getActiveBan, getViewer, type UserRow } from "@/lib/viewer";

const limit = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const NO_CONSENT = "Отметьте согласие на передачу имени и телефона тренеру — без него тренер не сможет с вами связаться";

/** Согласие на передачу имени и телефона тренеру (152-ФЗ): в журнал — кто, когда, какому тренеру, какая редакция */
async function recordCoachConsent(me: UserRow, coachId: string) {
  const [coach, fresh] = await Promise.all([
    db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, coachId), columns: { displayName: true } }),
    db.query.user.findFirst({ where: eq(s.user.id, me.id), columns: { phone: true } }),
  ]);
  await recordConsent({
    kind: "COACH_TRANSFER",
    source: "TRAINING",
    userId: me.id,
    name: me.name,
    email: me.email,
    phone: fresh?.phone ?? me.phone,
    recipientId: coachId,
    recipientName: coach?.displayName ?? null,
    ...(await getRequestMeta()),
  });
}

export async function bookTraining(slotId: string, comment: string, consent: boolean): Promise<{ ok?: string; error?: string; login?: boolean }> {
  const me = await getViewer();
  if (!me) return { login: true, error: "Войдите, чтобы записаться" };
  if (consent !== true) return { error: NO_CONSENT };
  if (getActiveBan(me)) return { error: "Запись недоступна" };
  if (!limit(me.id)) return { error: "Слишком часто — попробуйте через несколько минут" };
  const p = z.object({ slotId: z.string().min(1).max(64), comment: z.string().max(500) }).safeParse({ slotId, comment });
  if (!p.success) return { error: "Проверьте данные" };
  try {
    const b = await bookSlot(me.id, p.data.slotId, p.data.comment.trim());
    await recordCoachConsent(me, b.slot.coachId);
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

/** Индивидуальная: клиент выбрал свободное время тренера → заявка */
export async function requestTrainingAction(input: { coachId: string; clubId: string; day: string; time: string; durationMin: number; comment: string; phone?: string; trial?: boolean; consent?: boolean }): Promise<{ ok?: string; error?: string; login?: boolean; confirmed?: boolean }> {
  const me = await getViewer();
  if (!me) return { login: true, error: "Войдите, чтобы записаться" };
  if (getActiveBan(me)) return { error: "Запись недоступна" };
  if (input.consent !== true) return { error: NO_CONSENT };
  if (!limit(me.id)) return { error: "Слишком часто — попробуйте через несколько минут" };
  const p = z
    .object({
      coachId: z.string().min(1).max(64),
      clubId: z.string().min(1).max(64),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationMin: z.number().int().min(30).max(240),
      comment: z.string().max(500),
      phone: z.string().max(40).optional(),
      trial: z.boolean().optional(),
    })
    .safeParse(input);
  if (!p.success) return { error: "Проверьте данные" };
  if (!me.phone) {
    // Телефон нужен тренеру для связи; сохраняем в аккаунт, как при заказе
    const phone = normalizePhone(p.data.phone ?? "");
    if (!phone) return { error: "Укажите телефон — тренеру нужно как-то с вами связаться" };
    await db.update(s.user).set({ phone }).where(and(eq(s.user.id, me.id), isNull(s.user.phone)));
  }
  try {
    const b = await requestTraining(me.id, {
      coachId: p.data.coachId,
      clubId: p.data.clubId,
      startsAt: new Date(`${p.data.day}T${p.data.time}:00+03:00`),
      durationMin: p.data.durationMin,
      comment: p.data.comment.trim(),
      trial: p.data.trial,
    });
    await recordCoachConsent(me, p.data.coachId);
    revalidatePath("/trenirovki", "layout");
    revalidatePath("/account");
    return b.status === "BOOKED"
      ? { ok: "Тренировка подтверждена! Письмо уже на почте, напомним накануне", confirmed: true }
      : { ok: "Заявка отправлена тренеру. Как только подтвердит — придёт письмо. Статус — в личном кабинете" };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}
