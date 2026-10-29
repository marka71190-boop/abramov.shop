/**
 * Тренировки в клубах: расписание тренеров, запись покупателей, напоминания.
 * Оплата — в клубе, после тренировки. Время — московское (клубы в Краснодаре, Ростове и Аксае, UTC+3).
 */
import "server-only";
import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

/** Отменить запись покупатель может не позже, чем за столько часов */
export const CANCEL_HOURS = 3;
/** Насколько вперёд показываем расписание */
export const HORIZON_DAYS = 45;

export const KIND_LABEL: Record<string, string> = { INDIVIDUAL: "Индивидуальная", GROUP: "Групповая" };

const tz = "Europe/Moscow";
export const fmtDay = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtTime = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtWhen = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
/** Ключ дня по Москве: 2026-10-30 */
export const dayKey = (d: Date) => new Date(+d + 3 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- доступ тренера

export async function requireCoach() {
  const me = await getViewer();
  if (!me) redirect("/login?next=/coach");
  if (getActiveBan(me)) redirect("/");
  if (me.role !== "COACH" && !isAdmin(me)) redirect("/account");
  return me;
}

/** Профиль создаётся сам, когда владелец выдаёт роль тренера */
export async function ensureCoachProfile(userId: string) {
  const existing = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, userId) });
  if (existing) return existing;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, userId), columns: { name: true } });
  const base = slugify(u?.name || "trener") || "trener";
  let slug = base;
  for (let i = 2; await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.slug, slug), columns: { userId: true } }); i++) slug = `${base}-${i}`;
  const [row] = await db
    .insert(s.coachProfile)
    .values({ userId, slug, displayName: u?.name?.trim() || "Тренер" })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, userId) }))!;
}

// ---------------------------------------------------------------- расписание

export type SlotView = Awaited<ReturnType<typeof upcomingSlots>>[number];

/** Будущие открытые тренировки опубликованных тренеров + сколько мест занято */
export async function upcomingSlots(opts: { clubId?: string; coachId?: string; days?: number } = {}) {
  const now = new Date();
  const until = new Date(+now + (opts.days ?? HORIZON_DAYS) * 86400_000);
  const rows = await db
    .select({
      slot: s.trainingSlot,
      club: { id: s.club.id, name: s.club.name, city: s.club.city, address: s.club.address },
      coach: { userId: s.coachProfile.userId, slug: s.coachProfile.slug, displayName: s.coachProfile.displayName, photo: s.coachProfile.photo },
      booked: sql<number>`(select count(*)::int from ${s.trainingBooking} b where b.slot_id = ${s.trainingSlot.id} and b.status <> 'CANCELLED')`,
    })
    .from(s.trainingSlot)
    .innerJoin(s.club, eq(s.club.id, s.trainingSlot.clubId))
    .innerJoin(s.coachProfile, eq(s.coachProfile.userId, s.trainingSlot.coachId))
    .innerJoin(s.user, eq(s.user.id, s.trainingSlot.coachId))
    .where(
      and(
        eq(s.trainingSlot.status, "OPEN"),
        gt(s.trainingSlot.startsAt, now),
        lte(s.trainingSlot.startsAt, until),
        eq(s.coachProfile.isPublished, true),
        eq(s.user.role, "COACH"),
        eq(s.club.isActive, true),
        opts.clubId ? eq(s.trainingSlot.clubId, opts.clubId) : undefined,
        opts.coachId ? eq(s.trainingSlot.coachId, opts.coachId) : undefined,
      ),
    )
    .orderBy(asc(s.trainingSlot.startsAt))
    .limit(500);
  return rows.map((r) => ({ ...r, left: Math.max(0, r.slot.capacity - r.booked) }));
}

/** Тренеры на сайте: опубликованные, с ролью тренера */
export async function publicCoaches() {
  return db
    .select({ profile: s.coachProfile })
    .from(s.coachProfile)
    .innerJoin(s.user, eq(s.user.id, s.coachProfile.userId))
    .where(and(eq(s.coachProfile.isPublished, true), eq(s.user.role, "COACH")))
    .orderBy(asc(s.coachProfile.sortOrder), asc(s.coachProfile.displayName))
    .then((r) => r.map((x) => x.profile));
}

/** Мои записи (покупатель) */
export async function myBookings(userId: string) {
  return db.query.trainingBooking.findMany({
    where: and(eq(s.trainingBooking.userId, userId), ne(s.trainingBooking.status, "CANCELLED")),
    with: { slot: { with: { club: true } } },
    orderBy: (b, { desc }) => desc(b.createdAt),
    limit: 50,
  });
}

// ---------------------------------------------------------------- запись

export class BookingError extends Error {}

export async function bookSlot(userId: string, slotId: string, comment: string) {
  const res = await db.transaction(async (tx) => {
    // Блокируем строку тренировки: два человека не займут последнее место одновременно
    const [slot] = await tx.select().from(s.trainingSlot).where(eq(s.trainingSlot.id, slotId)).for("update");
    if (!slot || slot.status !== "OPEN") throw new BookingError("Эта тренировка отменена или не найдена");
    if (slot.startsAt <= new Date()) throw new BookingError("Тренировка уже началась");
    if (slot.coachId === userId) throw new BookingError("Это ваша тренировка");
    const active = await tx
      .select({ userId: s.trainingBooking.userId })
      .from(s.trainingBooking)
      .where(and(eq(s.trainingBooking.slotId, slotId), ne(s.trainingBooking.status, "CANCELLED")));
    if (active.some((b) => b.userId === userId)) throw new BookingError("Вы уже записаны на эту тренировку");
    if (active.length >= slot.capacity) throw new BookingError("Мест не осталось — выберите другое время");
    // Не больше 5 будущих записей на человека — от случайных и шуточных броней
    const mine = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.trainingBooking)
      .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
      .where(and(eq(s.trainingBooking.userId, userId), eq(s.trainingBooking.status, "BOOKED"), gt(s.trainingSlot.startsAt, new Date())));
    if ((mine[0]?.n ?? 0) >= 5) throw new BookingError("У вас уже 5 записей вперёд — сначала сходите на них или отмените лишние");
    const [b] = await tx.insert(s.trainingBooking).values({ slotId, userId, comment: comment.slice(0, 500) }).returning();
    return { booking: b, slot };
  });
  void notifyBooked(res.booking.id);
  return res;
}

export async function cancelBookingByUser(userId: string, bookingId: string) {
  const b = await db.query.trainingBooking.findFirst({ where: and(eq(s.trainingBooking.id, bookingId), eq(s.trainingBooking.userId, userId)), with: { slot: true } });
  if (!b || b.status !== "BOOKED") throw new BookingError("Запись не найдена");
  if (+b.slot.startsAt - Date.now() < CANCEL_HOURS * 3600_000)
    throw new BookingError(`Отменить можно не позже чем за ${CANCEL_HOURS} ч до начала — позвоните в клуб или напишите тренеру`);
  await db.update(s.trainingBooking).set({ status: "CANCELLED", cancelledBy: "USER", cancelledAt: new Date() }).where(eq(s.trainingBooking.id, b.id));
  const { notifyUser } = await import("@/lib/telegram");
  void notifyUser(b.slot.coachId, `Запись отменена: ${fmtWhen(b.slot.startsAt)} — ${escHtml(b.slot.title)}. Место снова свободно.`, { text: "Кабинет тренера", url: `${SITE.url}/coach` });
}

/** Тренер отменяет тренировку: всем записанным — письмо и уведомление */
export async function cancelSlot(slotId: string, reason: string) {
  const slot = await db.query.trainingSlot.findFirst({ where: eq(s.trainingSlot.id, slotId), with: { club: true, bookings: { with: { user: { columns: { id: true, email: true } } } } } });
  if (!slot || slot.status !== "OPEN") return 0;
  await db.transaction(async (tx) => {
    await tx.update(s.trainingSlot).set({ status: "CANCELLED", cancelReason: reason || null }).where(eq(s.trainingSlot.id, slotId));
    await tx
      .update(s.trainingBooking)
      .set({ status: "CANCELLED", cancelledBy: "COACH", cancelledAt: new Date() })
      .where(and(eq(s.trainingBooking.slotId, slotId), eq(s.trainingBooking.status, "BOOKED")));
  });
  const active = slot.bookings.filter((b) => b.status === "BOOKED");
  const { notifyUser } = await import("@/lib/telegram");
  const { sendMail } = await import("@/lib/mail");
  for (const b of active) {
    const text = `Тренировка ${fmtWhen(slot.startsAt)} в клубе «${slot.club.name}» отменена${reason ? `: ${reason}` : ""}.`;
    void notifyUser(b.user.id, `❌ ${escHtml(text)}`, { text: "Выбрать другое время", url: `${SITE.url}/trenirovki` });
    void sendMail(b.user.email, "Тренировка отменена", "Тренировка отменена", `${escHtml(text)}<br><br>Извините за неудобство — выберите другое время в расписании.`, {
      text: "Расписание тренировок",
      url: `${SITE.url}/trenirovki`,
    }).catch((e) => console.error("[trainings] письмо:", e));
  }
  return active.length;
}

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Новая запись: тренеру — без личных данных (Telegram — иностранный сервис), покупателю — письмо-подтверждение */
async function notifyBooked(bookingId: string) {
  try {
    const b = await db.query.trainingBooking.findFirst({
      where: eq(s.trainingBooking.id, bookingId),
      with: { slot: { with: { club: true } }, user: { columns: { id: true, email: true } } },
    });
    if (!b) return;
    const { notifyUser } = await import("@/lib/telegram");
    void notifyUser(b.slot.coachId, `🎱 Новая запись: ${fmtWhen(b.slot.startsAt)} — ${escHtml(b.slot.title)}, ${escHtml(b.slot.club.name)}`, {
      text: "Кабинет тренера",
      url: `${SITE.url}/coach`,
    });
    const { sendMail } = await import("@/lib/mail");
    const c = b.slot.club;
    await sendMail(
      b.user.email,
      `Вы записаны на тренировку ${fmtWhen(b.slot.startsAt)}`,
      "Вы записаны на тренировку",
      `<b>${escHtml(b.slot.title)}</b><br>${fmtDay(b.slot.startsAt)}, ${fmtTime(b.slot.startsAt)} · ${b.slot.durationMin} мин<br>` +
        `${escHtml(c.name)}: ${escHtml(c.city)}, ${escHtml(c.address)}` +
        (b.slot.price ? `<br>Стоимость: ${(b.slot.price / 100).toLocaleString("ru-RU")} ₽ — оплата в клубе` : "") +
        `<br><br>Отменить запись можно в личном кабинете не позже чем за ${CANCEL_HOURS} ч до начала. Накануне пришлём напоминание.`,
      { text: "Мои тренировки", url: `${SITE.url}/account#trainings` },
    );
  } catch (e) {
    console.error("[trainings] уведомление:", e instanceof Error ? e.message : e);
  }
}

/** Напоминание за ~сутки (раз в час). Письмо, Telegram и уведомление на телефон */
export async function remindTrainings() {
  const now = new Date();
  // Не будим людей: напоминания только с 9 до 22 по Москве
  const h = (now.getUTCHours() + 3) % 24;
  if (h < 9 || h >= 22) return;
  const soon = new Date(+now + 24 * 3600_000);
  const due = await db
    .select({ id: s.trainingBooking.id })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .where(and(eq(s.trainingBooking.status, "BOOKED"), isNull(s.trainingBooking.remindedAt), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, new Date(+now + 2 * 3600_000)), lte(s.trainingSlot.startsAt, soon)))
    .limit(200);
  if (!due.length) return;
  const list = await db.query.trainingBooking.findMany({
    where: inArray(s.trainingBooking.id, due.map((d) => d.id)),
    with: { slot: { with: { club: true } }, user: { columns: { id: true, email: true } } },
  });
  const { notifyUser } = await import("@/lib/telegram");
  const { sendMail } = await import("@/lib/mail");
  for (const b of list) {
    await db.update(s.trainingBooking).set({ remindedAt: new Date() }).where(eq(s.trainingBooking.id, b.id));
    const when = `${fmtDay(b.slot.startsAt)}, ${fmtTime(b.slot.startsAt)}`;
    void notifyUser(b.user.id, `⏰ Завтра тренировка: ${when} — ${escHtml(b.slot.club.name)}`, { text: "Подробнее", url: `${SITE.url}/account#trainings` });
    void sendMail(
      b.user.email,
      `Напоминание: тренировка ${when}`,
      "Ждём вас на тренировке",
      `<b>${escHtml(b.slot.title)}</b><br>${when} · ${b.slot.durationMin} мин<br>${escHtml(b.slot.club.name)}: ${escHtml(b.slot.club.city)}, ${escHtml(b.slot.club.address)}<br><br>Если планы изменились — отмените запись в личном кабинете, чтобы место досталось другому.`,
      { text: "Мои тренировки", url: `${SITE.url}/account#trainings` },
    ).catch(() => {});
  }
}
