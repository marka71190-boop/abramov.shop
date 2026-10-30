/**
 * Тренировки в клубах.
 *
 * Индивидуальные: тренер задаёт рабочее время по дням недели, клиент выбирает свободное время
 * и отправляет заявку, тренер подтверждает (или заявки подтверждаются сами). Тренер может сам внести
 * тренировку в дневник — клиенту с сайта или гостю по имени и телефону.
 * Групповые: тренер публикует в расписании, записываются сразу.
 *
 * Оплата — в клубе. Время — московское (клубы в Краснодаре, Ростове и Аксае, UTC+3).
 */
import "server-only";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

/** Отменить подтверждённую тренировку клиент может не позже, чем за столько часов */
export const CANCEL_HOURS = 3;
/** Групповые — насколько вперёд показываем */
export const HORIZON_DAYS = 45;
/** Активные записи (занимают место и время) */
export const ACTIVE = ["REQUESTED", "BOOKED", "ATTENDED", "NO_SHOW"] as const;
const INACTIVE = ["CANCELLED", "DECLINED"] as const;

export const KIND_LABEL: Record<string, string> = { INDIVIDUAL: "Индивидуальная", GROUP: "Групповая" };
export const BOOKING_LABEL: Record<string, string> = {
  REQUESTED: "Заявка — ждёт подтверждения",
  BOOKED: "Подтверждена",
  ATTENDED: "Состоялась",
  NO_SHOW: "Не пришёл",
  CANCELLED: "Отменена",
  DECLINED: "Тренер не сможет",
};
export const WEEKDAYS = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const MSK = 3 * 3600_000;
const tz = "Europe/Moscow";
export const fmtDay = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtTime = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtWhen = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
/** Ключ дня по Москве: 2026-10-30 */
export const dayKey = (d: Date) => new Date(+d + MSK).toISOString().slice(0, 10);
/** Полночь дня (по Москве) как Date */
export const dayStart = (key: string) => new Date(`${key}T00:00:00+03:00`);
/** День недели по Москве: 1 — понедельник … 7 — воскресенье */
export const weekdayOf = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const parseHhmm = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]) * 60 + Number(m[2]);
  return n >= 0 && n <= 24 * 60 ? n : null;
};
export const addDays = (key: string, n: number) => dayKey(new Date(+dayStart(key) + n * 86400_000 + 12 * 3600_000));

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rubles = (kop: number) => `${(kop / 100).toLocaleString("ru-RU")} ₽`;

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

/** Имя клиента для тренера: с сайта — из аккаунта, иначе — как записал тренер */
export const clientName = (b: { user?: { name: string } | null; guestName?: string | null }) => b.user?.name ?? b.guestName ?? "Клиент";
export const clientPhone = (b: { user?: { phone: string | null } | null; guestPhone?: string | null }) => b.user?.phone ?? b.guestPhone ?? null;

// ---------------------------------------------------------------- свободное время

type Busy = { start: number; end: number };

/** Всё, что занимает время тренера с from по to: открытые тренировки любого типа */
type Q = Pick<typeof db, "select">;

async function busyOf(coachId: string, from: Date, to: Date, q: Q = db): Promise<Busy[]> {
  const rows = await q
    .select({ startsAt: s.trainingSlot.startsAt, durationMin: s.trainingSlot.durationMin })
    .from(s.trainingSlot)
    .where(and(eq(s.trainingSlot.coachId, coachId), eq(s.trainingSlot.status, "OPEN"), lt(s.trainingSlot.startsAt, to), gt(s.trainingSlot.startsAt, new Date(+from - 6 * 3600_000))));
  return rows.map((r) => ({ start: +r.startsAt, end: +r.startsAt + r.durationMin * 60_000 }));
}

export type FreeMap = Record<string, Record<string, Record<number, string[]>>>; // клуб → день → длительность → ["18:00", …]

/**
 * Свободное время тренера на horizonDays вперёд: по клубам, дням и длительностям.
 * Считается по рабочим часам минус выходные минус уже занятые тренировки.
 */
export async function freeTimes(coachId: string) {
  const profile = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, coachId) });
  if (!profile) return { free: {} as FreeMap, profile: null, days: [] as string[] };
  const today = dayKey(new Date());
  const days = Array.from({ length: Math.max(1, Math.min(60, profile.horizonDays)) }, (_, i) => addDays(today, i));
  const [hours, offs] = await Promise.all([
    db.select().from(s.coachHours).where(eq(s.coachHours.coachId, coachId)),
    db
      .select({ day: s.coachDayOff.day })
      .from(s.coachDayOff)
      .where(and(eq(s.coachDayOff.coachId, coachId), gte(s.coachDayOff.day, today), lte(s.coachDayOff.day, days[days.length - 1]))),
  ]);
  const off = new Set(offs.map((o) => o.day));
  const busy = await busyOf(coachId, dayStart(today), new Date(+dayStart(days[days.length - 1]) + 86400_000));
  const earliest = Date.now() + profile.leadHours * 3600_000;
  const step = Math.max(15, profile.stepMin);
  const durations = (profile.durations.length ? profile.durations : [60]).filter((d) => d >= 30 && d <= 240).sort((a, b) => a - b);
  const free: FreeMap = {};
  for (const day of days) {
    if (off.has(day)) continue;
    const wd = weekdayOf(day);
    const base = +dayStart(day);
    for (const h of hours.filter((x) => x.weekday === wd)) {
      for (const dur of durations) {
        for (let m = h.startMin; m + dur <= h.endMin; m += step) {
          const st = base + m * 60_000;
          const en = st + dur * 60_000;
          if (st < earliest) continue;
          if (busy.some((b) => b.start < en && b.end > st)) continue;
          ((free[h.clubId] ??= {})[day] ??= {})[dur] ??= [];
          free[h.clubId][day][dur].push(hhmm(m));
        }
      }
    }
  }
  return { free, profile, days };
}

/** Есть ли у тренера окно: время внутри рабочих часов этого клуба, не выходной, не занято */
async function isFree(q: Q, coachId: string, clubId: string, startsAt: Date, durationMin: number, opts: { ignoreHours?: boolean } = {}) {
  const key = dayKey(startsAt);
  const startMin = Math.round((+startsAt - +dayStart(key)) / 60_000);
  if (!opts.ignoreHours) {
    const [off] = await q.select({ id: s.coachDayOff.id }).from(s.coachDayOff).where(and(eq(s.coachDayOff.coachId, coachId), eq(s.coachDayOff.day, key))).limit(1);
    if (off) return false;
    const hours = await q
      .select()
      .from(s.coachHours)
      .where(and(eq(s.coachHours.coachId, coachId), eq(s.coachHours.clubId, clubId), eq(s.coachHours.weekday, weekdayOf(key))));
    if (!hours.some((h) => h.startMin <= startMin && startMin + durationMin <= h.endMin)) return false;
  }
  const end = +startsAt + durationMin * 60_000;
  const busy = await busyOf(coachId, new Date(+startsAt - 86400_000), new Date(end), q);
  return !busy.some((b) => b.start < end && b.end > +startsAt);
}

// ---------------------------------------------------------------- заявка клиента

export class BookingError extends Error {}

/** Клиент выбрал свободное время → заявка (или сразу подтверждённая, если у тренера автоподтверждение) */
export async function requestTraining(userId: string, input: { coachId: string; clubId: string; startsAt: Date; durationMin: number; comment: string }) {
  const profile = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, input.coachId), with: { user: { columns: { role: true } } } });
  if (!profile || !profile.isPublished || profile.user.role !== "COACH") throw new BookingError("Тренер не найден");
  if (input.coachId === userId) throw new BookingError("Это вы");
  if (!profile.durations.includes(input.durationMin)) throw new BookingError("Выберите длительность из предложенных");
  if (+input.startsAt < Date.now() + profile.leadHours * 3600_000) throw new BookingError(`Записаться можно не раньше чем за ${profile.leadHours} ч`);
  if (+input.startsAt > Date.now() + (profile.horizonDays + 1) * 86400_000) throw new BookingError("Так далеко вперёд запись ещё не открыта");
  const pending = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .where(and(eq(s.trainingBooking.userId, userId), inArray(s.trainingBooking.status, ["REQUESTED", "BOOKED"]), gt(s.trainingSlot.startsAt, new Date())));
  if ((pending[0]?.n ?? 0) >= 6) throw new BookingError("У вас уже 6 заявок и тренировок впереди — сначала сходите на них или отмените лишние");

  const status = profile.autoConfirm ? ("BOOKED" as const) : ("REQUESTED" as const);
  const booking = await db.transaction(async (tx) => {
    // Одна заявка за раз на тренера: две не займут одно окно
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.coachId}))`);
    if (!(await isFree(tx, input.coachId, input.clubId, input.startsAt, input.durationMin))) throw new BookingError("Это время только что заняли — выберите другое");
    const [slot] = await tx
      .insert(s.trainingSlot)
      .values({
        coachId: input.coachId,
        clubId: input.clubId,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        kind: "INDIVIDUAL",
        title: "Индивидуальная тренировка",
        capacity: 1,
        price: Math.round((profile.pricePerHour * input.durationMin) / 60),
        source: "REQUEST",
      })
      .returning();
    const [b] = await tx.insert(s.trainingBooking).values({ slotId: slot.id, userId, status, comment: input.comment.slice(0, 500) }).returning();
    return b;
  });
  void notifyRequest(booking.id);
  return booking;
}

/** Тренер подтверждает заявку */
export async function confirmRequest(bookingId: string) {
  const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: true } });
  if (!b || b.status !== "REQUESTED") throw new BookingError("Заявка уже обработана");
  await db.update(s.trainingBooking).set({ status: "BOOKED" }).where(eq(s.trainingBooking.id, b.id));
  void mailClient(b.id, "confirmed");
}

/** Тренер отказывает (или заявка истекла): время снова свободно */
export async function declineRequest(bookingId: string, reason: string) {
  const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: true } });
  if (!b || b.status !== "REQUESTED") throw new BookingError("Заявка уже обработана");
  await db.transaction(async (tx) => {
    await tx.update(s.trainingBooking).set({ status: "DECLINED", declineReason: reason || null, cancelledAt: new Date(), cancelledBy: "COACH" }).where(eq(s.trainingBooking.id, b.id));
    if (b.slot.source !== "PUBLISHED") await tx.update(s.trainingSlot).set({ status: "CANCELLED", cancelReason: reason || null }).where(eq(s.trainingSlot.id, b.slotId));
  });
  void mailClient(b.id, "declined");
}

// ---------------------------------------------------------------- тренер вносит сам (дневник)

export async function addManualTraining(input: {
  coachId: string;
  clubId: string;
  startsAt: Date;
  durationMin: number;
  price: number;
  clientUserId: string | null;
  guestName: string;
  guestPhone: string | null;
  note: string;
}) {
  const res = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.coachId}))`);
    if (!(await isFree(tx, input.coachId, input.clubId, input.startsAt, input.durationMin, { ignoreHours: true }))) throw new BookingError("В это время у вас уже есть тренировка");
    const [slot] = await tx
      .insert(s.trainingSlot)
      .values({
        coachId: input.coachId,
        clubId: input.clubId,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        kind: "INDIVIDUAL",
        title: "Индивидуальная тренировка",
        capacity: 1,
        price: input.price,
        note: input.note,
        source: "MANUAL",
      })
      .returning();
    const [b] = await tx
      .insert(s.trainingBooking)
      .values({ slotId: slot.id, userId: input.clientUserId, guestName: input.clientUserId ? null : input.guestName, guestPhone: input.clientUserId ? null : input.guestPhone, status: "BOOKED" })
      .returning();
    return b;
  });
  if (input.clientUserId) void mailClient(res.id, "added");
  return res;
}

// ---------------------------------------------------------------- групповые

export type SlotView = Awaited<ReturnType<typeof upcomingSlots>>[number];

/** Будущие групповые тренировки опубликованных тренеров + сколько мест занято */
export async function upcomingSlots(opts: { clubId?: string; coachId?: string; days?: number } = {}) {
  const now = new Date();
  const until = new Date(+now + (opts.days ?? HORIZON_DAYS) * 86400_000);
  const rows = await db
    .select({
      slot: s.trainingSlot,
      club: { id: s.club.id, name: s.club.name, city: s.club.city, address: s.club.address },
      coach: { userId: s.coachProfile.userId, slug: s.coachProfile.slug, displayName: s.coachProfile.displayName, photo: s.coachProfile.photo },
      booked: sql<number>`(select count(*)::int from ${s.trainingBooking} b where b.slot_id = ${s.trainingSlot.id} and b.status not in ('CANCELLED', 'DECLINED'))`,
    })
    .from(s.trainingSlot)
    .innerJoin(s.club, eq(s.club.id, s.trainingSlot.clubId))
    .innerJoin(s.coachProfile, eq(s.coachProfile.userId, s.trainingSlot.coachId))
    .innerJoin(s.user, eq(s.user.id, s.trainingSlot.coachId))
    .where(
      and(
        eq(s.trainingSlot.status, "OPEN"),
        eq(s.trainingSlot.source, "PUBLISHED"),
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

/** Мои записи (покупатель): заявки, подтверждённые и прошедшие */
export async function myBookings(userId: string) {
  return db.query.trainingBooking.findMany({
    where: and(eq(s.trainingBooking.userId, userId), notInArray(s.trainingBooking.status, [...INACTIVE])),
    with: { slot: { with: { club: true } } },
    orderBy: (b, { desc }) => desc(b.createdAt),
    limit: 50,
  });
}

/** Для личного кабинета: заявки, подтверждённые и недавние отказы — с именем тренера */
export async function accountTrainings(userId: string) {
  const rows = await db
    .select({
      id: s.trainingBooking.id,
      status: s.trainingBooking.status,
      declineReason: s.trainingBooking.declineReason,
      cancelledAt: s.trainingBooking.cancelledAt,
      slot: { startsAt: s.trainingSlot.startsAt, durationMin: s.trainingSlot.durationMin, title: s.trainingSlot.title, price: s.trainingSlot.price, kind: s.trainingSlot.kind, status: s.trainingSlot.status },
      club: { name: s.club.name, city: s.club.city, address: s.club.address },
      coach: { displayName: s.coachProfile.displayName, slug: s.coachProfile.slug },
    })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .innerJoin(s.club, eq(s.club.id, s.trainingSlot.clubId))
    .leftJoin(s.coachProfile, eq(s.coachProfile.userId, s.trainingSlot.coachId))
    .where(and(eq(s.trainingBooking.userId, userId), inArray(s.trainingBooking.status, ["REQUESTED", "BOOKED", "DECLINED"]), gt(s.trainingSlot.startsAt, new Date(Date.now() - 3 * 3600_000))))
    .orderBy(asc(s.trainingSlot.startsAt))
    .limit(30);
  const weekAgo = Date.now() - 7 * 86400_000;
  return rows.filter((r) => (r.status === "DECLINED" ? !!r.cancelledAt && +r.cancelledAt > weekAgo : r.slot.status === "OPEN"));
}

/** Запись на групповую тренировку — сразу подтверждена */
export async function bookSlot(userId: string, slotId: string, comment: string) {
  const res = await db.transaction(async (tx) => {
    const [slot] = await tx.select().from(s.trainingSlot).where(eq(s.trainingSlot.id, slotId)).for("update");
    if (!slot || slot.status !== "OPEN" || slot.source !== "PUBLISHED") throw new BookingError("Эта тренировка отменена или не найдена");
    if (slot.startsAt <= new Date()) throw new BookingError("Тренировка уже началась");
    if (slot.coachId === userId) throw new BookingError("Это ваша тренировка");
    const active = await tx
      .select({ userId: s.trainingBooking.userId })
      .from(s.trainingBooking)
      .where(and(eq(s.trainingBooking.slotId, slotId), notInArray(s.trainingBooking.status, [...INACTIVE])));
    if (active.some((b) => b.userId === userId)) throw new BookingError("Вы уже записаны на эту тренировку");
    if (active.length >= slot.capacity) throw new BookingError("Мест не осталось — выберите другое время");
    const [b] = await tx.insert(s.trainingBooking).values({ slotId, userId, comment: comment.slice(0, 500) }).returning();
    return { booking: b, slot };
  });
  void notifyRequest(res.booking.id);
  return res;
}

/** Клиент отменяет: заявку — в любой момент, подтверждённую — не позже чем за CANCEL_HOURS */
export async function cancelBookingByUser(userId: string, bookingId: string) {
  const b = await db.query.trainingBooking.findFirst({ where: and(eq(s.trainingBooking.id, bookingId), eq(s.trainingBooking.userId, userId)), with: { slot: true } });
  if (!b || (b.status !== "BOOKED" && b.status !== "REQUESTED")) throw new BookingError("Запись не найдена");
  if (b.status === "BOOKED" && +b.slot.startsAt - Date.now() < CANCEL_HOURS * 3600_000)
    throw new BookingError(`Отменить можно не позже чем за ${CANCEL_HOURS} ч до начала — позвоните в клуб или тренеру`);
  await db.transaction(async (tx) => {
    await tx.update(s.trainingBooking).set({ status: "CANCELLED", cancelledBy: "USER", cancelledAt: new Date() }).where(eq(s.trainingBooking.id, b.id));
    // Индивидуальная по заявке — время тренера снова свободно
    if (b.slot.source !== "PUBLISHED") await tx.update(s.trainingSlot).set({ status: "CANCELLED", cancelReason: "Клиент отменил" }).where(eq(s.trainingSlot.id, b.slotId));
  });
  const { notifyUser } = await import("@/lib/telegram");
  void notifyUser(b.slot.coachId, `Клиент отменил ${b.status === "REQUESTED" ? "заявку" : "тренировку"}: ${fmtWhen(b.slot.startsAt)}. Время снова свободно.`, {
    text: "Дневник",
    url: `${SITE.url}/coach?d=${dayKey(b.slot.startsAt)}`,
  });
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
      .where(and(eq(s.trainingBooking.slotId, slotId), inArray(s.trainingBooking.status, ["BOOKED", "REQUESTED"])));
  });
  const active = slot.bookings.filter((b) => b.status === "BOOKED" || b.status === "REQUESTED");
  const { notifyUser } = await import("@/lib/telegram");
  const { sendMail } = await import("@/lib/mail");
  for (const b of active) {
    if (!b.user) continue;
    const text = `Тренировка ${fmtWhen(slot.startsAt)} в клубе «${slot.club.name}» отменена${reason ? `: ${reason}` : ""}.`;
    void notifyUser(b.user.id, `❌ ${escHtml(text)}`, { text: "Выбрать другое время", url: `${SITE.url}/trenirovki` });
    void sendMail(b.user.email, "Тренировка отменена", "Тренировка отменена", `${escHtml(text)}<br><br>Извините за неудобство — выберите другое время.`, {
      text: "Тренировки",
      url: `${SITE.url}/trenirovki`,
    }).catch((e) => console.error("[trainings] письмо:", e));
  }
  return active.length;
}

// ---------------------------------------------------------------- уведомления

/** Новая заявка или запись: тренеру — без личных данных клиента (Telegram — иностранный сервис), клиенту — письмо */
async function notifyRequest(bookingId: string) {
  try {
    const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: { with: { club: true } } } });
    if (!b) return;
    const { notifyUser } = await import("@/lib/telegram");
    const what = b.status === "REQUESTED" ? "❓ Новая заявка на тренировку — подтвердите" : "🎱 Новая запись";
    void notifyUser(b.slot.coachId, `${what}: ${fmtWhen(b.slot.startsAt)}, ${b.slot.durationMin} мин — ${escHtml(b.slot.club.name)}`, {
      text: "Открыть дневник",
      url: `${SITE.url}/coach?d=${dayKey(b.slot.startsAt)}`,
    });
    await mailClient(b.id, b.status === "REQUESTED" ? "requested" : "confirmed");
  } catch (e) {
    console.error("[trainings] уведомление:", e instanceof Error ? e.message : e);
  }
}

type MailKind = "requested" | "confirmed" | "declined" | "added";

async function mailClient(bookingId: string, kind: MailKind) {
  try {
    const b = await db.query.trainingBooking.findFirst({
      where: eq(s.trainingBooking.id, bookingId),
      with: { slot: { with: { club: true } }, user: { columns: { id: true, email: true } } },
    });
    if (!b?.user) return;
    const c = b.slot.club;
    const coach = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, b.slot.coachId), columns: { displayName: true } });
    const when = `${fmtDay(b.slot.startsAt)}, ${fmtTime(b.slot.startsAt)} · ${b.slot.durationMin} мин`;
    const details =
      `<b>${escHtml(b.slot.title)}</b>${coach ? ` — тренер ${escHtml(coach.displayName)}` : ""}<br>${when}<br>${escHtml(c.name)}: ${escHtml(c.city)}, ${escHtml(c.address)}` +
      (b.slot.price ? `<br>Стоимость: ${rubles(b.slot.price)} — оплата в клубе` : "");
    const T: Record<MailKind, { subject: string; title: string; text: string }> = {
      requested: {
        subject: `Заявка на тренировку ${fmtWhen(b.slot.startsAt)}`,
        title: "Заявка отправлена тренеру",
        text: `${details}<br><br>Тренер подтвердит заявку — мы сразу пришлём письмо. Статус — в личном кабинете.`,
      },
      confirmed: {
        subject: `Тренировка подтверждена: ${fmtWhen(b.slot.startsAt)}`,
        title: "Тренировка подтверждена",
        text: `${details}<br><br>Ждём вас! Накануне пришлём напоминание. Отменить можно в личном кабинете не позже чем за ${CANCEL_HOURS} ч до начала.`,
      },
      declined: {
        subject: "Тренер не сможет в это время",
        title: "Тренер не сможет в это время",
        text: `${details}${b.declineReason ? `<br><br>Тренер: «${escHtml(b.declineReason)}»` : ""}<br><br>Выберите другое время — свободные окна на странице тренера.`,
      },
      added: {
        subject: `Тренер записал вас на тренировку ${fmtWhen(b.slot.startsAt)}`,
        title: "Вы записаны на тренировку",
        text: `${details}<br><br>Тренировка уже в вашем личном кабинете. Накануне пришлём напоминание.`,
      },
    };
    const t = T[kind];
    const { notifyUser } = await import("@/lib/telegram");
    if (kind !== "requested") void notifyUser(b.user.id, `🎱 ${escHtml(t.title)}: ${fmtWhen(b.slot.startsAt)}`, { text: "Мои тренировки", url: `${SITE.url}/account#trainings` });
    const { sendMail } = await import("@/lib/mail");
    await sendMail(b.user.email, t.subject, t.title, t.text, { text: "Мои тренировки", url: `${SITE.url}/account#trainings` });
  } catch (e) {
    console.error("[trainings] письмо:", e instanceof Error ? e.message : e);
  }
}

/**
 * Каждые 30 минут: заявки, на которые тренер не успел ответить до начала, закрываем;
 * за сутки до подтверждённой тренировки — напоминание (с 9 до 22 по Москве).
 */
export async function remindTrainings() {
  const now = new Date();
  const stale = await db
    .select({ id: s.trainingBooking.id })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .where(
      and(
        eq(s.trainingBooking.status, "REQUESTED"),
        // Скоро начало, а заявка висит больше получаса — или тренировка уже началась
        or(and(lt(s.trainingSlot.startsAt, new Date(+now + 30 * 60_000)), lt(s.trainingBooking.createdAt, new Date(+now - 30 * 60_000))), lt(s.trainingSlot.startsAt, now)),
      ),
    )
    .limit(100);
  for (const x of stale) await declineRequest(x.id, "Тренер не успел подтвердить заявку").catch(() => {});

  const h = (now.getUTCHours() + 3) % 24;
  if (h < 9 || h >= 22) return;
  const due = await db
    .select({ id: s.trainingBooking.id })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .where(and(eq(s.trainingBooking.status, "BOOKED"), isNull(s.trainingBooking.remindedAt), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, new Date(+now + 2 * 3600_000)), lte(s.trainingSlot.startsAt, new Date(+now + 24 * 3600_000))))
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
    if (!b.user) continue;
    const when = `${fmtDay(b.slot.startsAt)}, ${fmtTime(b.slot.startsAt)}`;
    void notifyUser(b.user.id, `⏰ Скоро тренировка: ${when} — ${escHtml(b.slot.club.name)}`, { text: "Подробнее", url: `${SITE.url}/account#trainings` });
    void sendMail(
      b.user.email,
      `Напоминание: тренировка ${when}`,
      "Ждём вас на тренировке",
      `<b>${escHtml(b.slot.title)}</b><br>${when} · ${b.slot.durationMin} мин<br>${escHtml(b.slot.club.name)}: ${escHtml(b.slot.club.city)}, ${escHtml(b.slot.club.address)}<br><br>Если планы изменились — отмените запись в личном кабинете, чтобы время досталось другому.`,
      { text: "Мои тренировки", url: `${SITE.url}/account#trainings` },
    ).catch(() => {});
  }
}
