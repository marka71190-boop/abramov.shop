"use server";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { addManualTraining, BookingError, cancelSlot, confirmRequest, declineRequest, ensureCoachProfile, parseHhmm, requireCoach } from "@/lib/trainings";
import { normalizePhone } from "@/lib/format";
import { isAdmin } from "@/lib/viewer";
import { AgreementError, confirmSigning, signedAgreement, startSigning } from "@/lib/coach-agreement";
import { getRequestMeta } from "@/lib/request";

type St = { ok?: string; error?: string };

/** Тренер с подписанным соглашением (или админ) */
async function requireSignedCoach() {
  const me = await requireCoach();
  if (me.role === "COACH" && !(await signedAgreement(me.id))) throw new Error("Сначала подпишите соглашение о конфиденциальности");
  return me;
}

/** Чьим кабинетом управляем: тренер — своим, админ — любого тренера (?u=) */
async function target(form: FormData | null, asUser?: string) {
  const me = await requireCoach();
  const wanted = asUser ?? (form?.get("coachId") ? String(form.get("coachId")) : "");
  if (isAdmin(me) && wanted && wanted !== me.id) {
    const u = await db.query.user.findFirst({ where: eq(s.user.id, wanted), columns: { id: true, role: true } });
    if (!u || u.role !== "COACH") throw new Error("Тренер не найден");
    return { me, coachId: u.id };
  }
  // Тренер без подписанного соглашения о конфиденциальности кабинетом не пользуется
  if (me.role === "COACH" && !(await signedAgreement(me.id))) throw new Error("Сначала подпишите соглашение о конфиденциальности");
  return { me, coachId: me.id };
}

const refresh = () => {
  revalidatePath("/coach");
  revalidatePath("/trenirovki", "layout");
};

const Profile = z.object({
  displayName: z.string().trim().min(2, "Как вас представить на сайте?").max(80),
  title: z.string().trim().max(160).default(""),
  about: z.string().trim().max(3000).default(""),
  games: z.string().trim().max(120).default(""),
  photo: z.string().trim().max(300).default(""),
});

export async function saveProfile(_: St, form: FormData): Promise<St> {
  const { me, coachId } = await target(form);
  const p = Profile.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  await ensureCoachProfile(coachId);
  const clubIds = form.getAll("clubIds").map(String).filter(Boolean).slice(0, 20);
  const photo = /^\/media\/[0-9a-f-]{36}$/.test(p.data.photo) ? p.data.photo : null;
  await db
    .update(s.coachProfile)
    .set({ displayName: p.data.displayName, title: p.data.title, about: p.data.about.replace(/\r\n/g, "\n"), games: p.data.games || "Русский бильярд", photo, clubIds, updatedAt: new Date() })
    .where(eq(s.coachProfile.userId, coachId));
  await audit(me.id, "coach.profile", "user", coachId);
  refresh();
  return { ok: "Профиль сохранён" };
}

const mskDate = (v: string) => {
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(+d) ? null : d;
};

const Slot = z.object({
  clubId: z.string().min(1, "Выберите клуб").max(64),
  startsAt: z.string().min(1, "Укажите дату и время"),
  durationMin: z.coerce.number().int().min(30, "От 30 минут").max(240, "До 4 часов"),
  kind: z.enum(["GROUP"]).default("GROUP"),
  capacity: z.coerce.number().int().min(1).max(20, "До 20 мест"),
  price: z.coerce.number().min(0).max(1_000_000),
  title: z.string().trim().max(120).default(""),
  note: z.string().trim().max(500).default(""),
  repeatWeeks: z.coerce.number().int().min(1).max(12).default(1),
});

/** Добавить тренировку (или серию — каждую неделю в то же время) */
export async function createSlots(_: St, form: FormData): Promise<St> {
  const { me, coachId } = await target(form);
  const p = Slot.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const first = mskDate(d.startsAt);
  if (!first) return { error: "Проверьте дату и время" };
  if (+first < Date.now() + 30 * 60_000) return { error: "Тренировка должна начинаться хотя бы через 30 минут" };
  if (+first > Date.now() + 120 * 86400_000) return { error: "Не дальше чем на 4 месяца вперёд" };
  const club = await db.query.club.findFirst({ where: and(eq(s.club.id, d.clubId), eq(s.club.isActive, true)), columns: { id: true } });
  if (!club) return { error: "Клуб не найден" };
  const capacity = Math.max(2, d.capacity);
  const title = d.title || "Групповая тренировка";
  const starts = Array.from({ length: d.repeatWeeks }, (_, i) => new Date(+first + i * 7 * 86400_000));
  // Пересечения с другими тренировками этого тренера
  const busy: string[] = [];
  for (const st of starts) {
    const end = new Date(+st + d.durationMin * 60_000);
    const clash = await db
      .select({ id: s.trainingSlot.id })
      .from(s.trainingSlot)
      .where(
        and(
          eq(s.trainingSlot.coachId, coachId),
          eq(s.trainingSlot.status, "OPEN"),
          lt(s.trainingSlot.startsAt, end),
          gt(sql`${s.trainingSlot.startsAt} + make_interval(mins => ${s.trainingSlot.durationMin})`, st),
        ),
      )
      .limit(1);
    if (clash.length) busy.push(st.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }));
  }
  if (busy.length) return { error: `В это время у вас уже есть тренировка: ${busy.join(", ")}` };
  await db.insert(s.trainingSlot).values(
    starts.map((st) => ({ coachId, clubId: d.clubId, startsAt: st, durationMin: d.durationMin, kind: d.kind, capacity, price: Math.round(d.price * 100), title, note: d.note })),
  );
  await audit(me.id, "training.create", "user", coachId, { count: starts.length });
  refresh();
  return { ok: starts.length > 1 ? `Добавлено тренировок: ${starts.length} — каждую неделю в это время` : "Тренировка добавлена в расписание" };
}

export async function cancelSlotAction(slotId: string, reason: string): Promise<St> {
  const me = await requireSignedCoach();
  const slot = await db.query.trainingSlot.findFirst({ where: eq(s.trainingSlot.id, slotId), columns: { coachId: true } });
  if (!slot || (slot.coachId !== me.id && !isAdmin(me))) return { error: "Тренировка не найдена" };
  const n = await cancelSlot(slotId, reason.trim().slice(0, 200));
  await audit(me.id, "training.cancel", "training_slot", slotId, { notified: n });
  refresh();
  return { ok: n ? `Отменено. Записавшимся (${n}) ушло уведомление` : "Тренировка отменена" };
}

/** Отметить, пришёл ли человек */
export async function markBooking(bookingId: string, status: "ATTENDED" | "NO_SHOW" | "BOOKED"): Promise<St> {
  const me = await requireSignedCoach();
  const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: { columns: { coachId: true, startsAt: true } } } });
  if (!b || (b.slot.coachId !== me.id && !isAdmin(me))) return { error: "Запись не найдена" };
  if (b.status === "CANCELLED") return { error: "Запись отменена" };
  if (status !== "BOOKED" && +b.slot.startsAt > Date.now()) return { error: "Отметить можно после начала тренировки" };
  await db.update(s.trainingBooking).set({ status }).where(and(eq(s.trainingBooking.id, bookingId), ne(s.trainingBooking.status, "CANCELLED")));
  revalidatePath("/coach");
  return { ok: "Отмечено" };
}

// ---------------------------------------------------------------- заявки и дневник

async function ownBooking(bookingId: string) {
  const me = await requireSignedCoach();
  const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: { columns: { coachId: true } } } });
  if (!b || (b.slot.coachId !== me.id && !isAdmin(me))) throw new Error("Заявка не найдена");
  return { me, b };
}

export async function confirmAction(bookingId: string): Promise<St> {
  const { me } = await ownBooking(bookingId);
  try {
    await confirmRequest(bookingId);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "training.confirm", "training_booking", bookingId);
  revalidatePath("/coach");
  return { ok: "Подтверждено — клиенту ушло письмо" };
}

export async function declineAction(bookingId: string, reason: string): Promise<St> {
  const { me } = await ownBooking(bookingId);
  try {
    await declineRequest(bookingId, reason.trim().slice(0, 200));
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "training.decline", "training_booking", bookingId);
  revalidatePath("/coach");
  revalidatePath("/trenirovki", "layout");
  return { ok: "Отказано — время снова свободно" };
}

export async function saveDiary(slotId: string, text: string): Promise<St> {
  const me = await requireSignedCoach();
  const slot = await db.query.trainingSlot.findFirst({ where: eq(s.trainingSlot.id, slotId), columns: { coachId: true } });
  if (!slot || (slot.coachId !== me.id && !isAdmin(me))) return { error: "Тренировка не найдена" };
  await db.update(s.trainingSlot).set({ diary: text.slice(0, 5000) }).where(eq(s.trainingSlot.id, slotId));
  return { ok: "Сохранено" };
}

const Manual = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(4, "Укажите время"),
  durationMin: z.coerce.number().int().min(15).max(300),
  clubId: z.string().min(1, "Выберите клуб").max(64),
  price: z.coerce.number().min(0).max(1_000_000).default(0),
  client: z.string().trim().max(120).default(""),
  guestName: z.string().trim().max(80).default(""),
  guestPhone: z.string().trim().max(30).default(""),
  note: z.string().trim().max(500).default(""),
});

/** Тренер сам вносит тренировку: клиент с сайта (почта или телефон) или гость по имени */
export async function addManual(_: St, form: FormData): Promise<St> {
  const { me, coachId } = await target(form);
  const p = Manual.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const min = parseHhmm(d.time);
  if (min == null) return { error: "Время в формате 18:30" };
  const startsAt = new Date(+new Date(`${d.day}T00:00:00+03:00`) + min * 60_000);
  if (+startsAt < Date.now() - 7 * 86400_000) return { error: "Можно вносить не старше недели назад" };
  const club = await db.query.club.findFirst({ where: eq(s.club.id, d.clubId), columns: { id: true } });
  if (!club) return { error: "Клуб не найден" };
  let clientUserId: string | null = null;
  if (d.client) {
    const phone = normalizePhone(d.client);
    const u = d.client.includes("@")
      ? await db.query.user.findFirst({ where: eq(s.user.email, d.client.toLowerCase()), columns: { id: true } })
      : phone
        ? await db.query.user.findFirst({ where: eq(s.user.phone, phone), columns: { id: true } })
        : null;
    if (u) clientUserId = u.id;
  }
  if (!clientUserId && !d.guestName && !d.client) return { error: "Укажите клиента: почту или телефон с сайта, или имя" };
  const guestName = d.guestName || (clientUserId ? "" : d.client);
  const guestPhone = d.guestPhone ? normalizePhone(d.guestPhone) : !clientUserId && normalizePhone(d.client) ? normalizePhone(d.client) : null;
  try {
    await addManualTraining({ coachId, clubId: d.clubId, startsAt, durationMin: d.durationMin, price: Math.round(d.price * 100), clientUserId, guestName, guestPhone, note: d.note });
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "training.manual", "user", coachId, { linked: !!clientUserId });
  refresh();
  return { ok: clientUserId ? "Добавлено. Клиент найден на сайте — ему ушло письмо, тренировка в его кабинете" : "Добавлено в дневник" };
}

// ---------------------------------------------------------------- рабочее время

const Hours = z.array(
  z.object({ weekday: z.number().int().min(1).max(7), clubId: z.string().min(1).max(64), start: z.string(), end: z.string() }),
).max(60);

export async function saveHours(json: string, coachIdParam?: string): Promise<St> {
  const { me, coachId } = await target(null, coachIdParam);
  const p = Hours.safeParse(JSON.parse(json || "[]"));
  if (!p.success) return { error: "Проверьте рабочее время" };
  const rows: { coachId: string; clubId: string; weekday: number; startMin: number; endMin: number }[] = [];
  for (const h of p.data) {
    const a = parseHhmm(h.start);
    const b = parseHhmm(h.end);
    if (a == null || b == null || b <= a) return { error: `${h.start}–${h.end}: конец должен быть позже начала` };
    rows.push({ coachId, clubId: h.clubId, weekday: h.weekday, startMin: a, endMin: b });
  }
  // Пересечения внутри одного дня
  for (const r of rows)
    if (rows.some((x) => x !== r && x.weekday === r.weekday && x.startMin < r.endMin && x.endMin > r.startMin))
      return { error: "В один день промежутки времени пересекаются — поправьте" };
  await db.transaction(async (tx) => {
    await tx.delete(s.coachHours).where(eq(s.coachHours.coachId, coachId));
    if (rows.length) await tx.insert(s.coachHours).values(rows);
  });
  await audit(me.id, "coach.hours", "user", coachId);
  refresh();
  return { ok: "Рабочее время сохранено" };
}

const Settings = z.object({
  pricePerHour: z.coerce.number().min(0).max(1_000_000),
  stepMin: z.coerce.number().int().refine((v) => [15, 30, 60].includes(v)),
  leadHours: z.coerce.number().int().min(0).max(72),
  horizonDays: z.coerce.number().int().min(1).max(60),
});

export async function saveBookingSettings(_: St, form: FormData): Promise<St> {
  const { me, coachId } = await target(form);
  const p = Settings.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Проверьте настройки" };
  const durations = form
    .getAll("durations")
    .map(Number)
    .filter((n) => [45, 60, 90, 120, 180].includes(n));
  if (!durations.length) return { error: "Отметьте хотя бы одну длительность" };
  await ensureCoachProfile(coachId);
  await db
    .update(s.coachProfile)
    .set({ pricePerHour: Math.round(p.data.pricePerHour * 100), stepMin: p.data.stepMin, leadHours: p.data.leadHours, horizonDays: p.data.horizonDays, durations: durations.sort((a, b) => a - b),
      autoConfirm: form.get("autoConfirm") === "on",
      trial: ["FREE", "HALF"].includes(String(form.get("trial"))) ? String(form.get("trial")) : "OFF",
      trialDurationMin: [30, 45, 60, 90].includes(Number(form.get("trialDurationMin"))) ? Number(form.get("trialDurationMin")) : 60,
    })
    .where(eq(s.coachProfile.userId, coachId));
  await audit(me.id, "coach.settings", "user", coachId);
  refresh();
  return { ok: "Сохранено" };
}

export async function addDayOff(_: St, form: FormData): Promise<St> {
  const { coachId } = await target(form);
  const from = String(form.get("from") || "");
  const to = String(form.get("to") || from);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { error: "Проверьте даты" };
  const note = String(form.get("note") || "").slice(0, 100);
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`) && days.length < 62; d = new Date(+d + 86400_000)) days.push(d.toISOString().slice(0, 10));
  await db.insert(s.coachDayOff).values(days.map((day) => ({ coachId, day, note }))).onConflictDoNothing();
  refresh();
  return { ok: days.length > 1 ? `Выходные: ${days.length} дн.` : "Выходной добавлен" };
}

export async function removeDayOff(id: string): Promise<void> {
  const me = await requireSignedCoach();
  const row = await db.query.coachDayOff.findFirst({ where: eq(s.coachDayOff.id, id) });
  if (!row || (row.coachId !== me.id && !isAdmin(me))) return;
  await db.delete(s.coachDayOff).where(eq(s.coachDayOff.id, id));
  refresh();
}

// ---------------------------------------------------------------- соглашение тренера

const Requisites = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, "Напишите фамилию, имя и отчество полностью")
    .max(120)
    .refine((v) => v.split(/\s+/).length >= 2, "Напишите фамилию, имя и отчество полностью"),
  taxStatus: z.enum(["SELF", "IP", "PERSON"], { message: "Выберите статус" }),
  inn: z.string().trim().max(12).default(""),
  phone: z.string().trim().max(40),
});

export async function agreementStart(_: { ok?: string; error?: string; id?: string; body?: string }, form: FormData): Promise<{ ok?: string; error?: string; id?: string; body?: string }> {
  const me = await requireCoach();
  if (me.role !== "COACH") return { error: "Соглашение подписывает сам тренер" };
  if (form.get("agree") !== "on") return { error: "Отметьте, что прочитали и согласны с текстом" };
  const p = Requisites.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const inn = p.data.inn.replace(/\D/g, "");
  if (p.data.taxStatus !== "PERSON" && !/^\d{12}$/.test(inn)) return { error: "ИНН физлица — 12 цифр" };
  const phone = normalizePhone(p.data.phone);
  if (!phone) return { error: "Проверьте телефон" };
  try {
    const r = await startSigning({ id: me.id, email: me.email }, { fullName: p.data.fullName.replace(/\s+/g, " "), taxStatus: p.data.taxStatus, inn: inn || null, phone });
    return { ok: `Код отправлен на ${me.email}`, id: r.id, body: r.body };
  } catch (e) {
    if (e instanceof AgreementError) return { error: e.message };
    throw e;
  }
}

export async function agreementConfirm(id: string, code: string): Promise<{ ok?: string; error?: string }> {
  const me = await requireCoach();
  if (!/^\d{6}$/.test(code.trim())) return { error: "Код — 6 цифр из письма" };
  try {
    await confirmSigning(me.id, id, code, await getRequestMeta());
  } catch (e) {
    if (e instanceof AgreementError) return { error: e.message };
    throw e;
  }
  await audit(me.id, "coach.agreement.signed", "user", me.id);
  revalidatePath("/coach", "layout");
  revalidatePath("/admin/coaches");
  return { ok: "Соглашение подписано" };
}
