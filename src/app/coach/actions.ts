"use server";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { cancelSlot, ensureCoachProfile, requireCoach } from "@/lib/trainings";
import { isAdmin } from "@/lib/viewer";

type St = { ok?: string; error?: string };

/** Чьим кабинетом управляем: тренер — своим, админ — любого тренера (?u=) */
async function target(form: FormData | null, asUser?: string) {
  const me = await requireCoach();
  const wanted = asUser ?? (form?.get("coachId") ? String(form.get("coachId")) : "");
  if (isAdmin(me) && wanted && wanted !== me.id) {
    const u = await db.query.user.findFirst({ where: eq(s.user.id, wanted), columns: { id: true, role: true } });
    if (!u || u.role !== "COACH") throw new Error("Тренер не найден");
    return { me, coachId: u.id };
  }
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
  kind: z.enum(["INDIVIDUAL", "GROUP"]),
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
  const capacity = d.kind === "INDIVIDUAL" ? 1 : Math.max(2, d.capacity);
  const title = d.title || (d.kind === "INDIVIDUAL" ? "Индивидуальная тренировка" : "Групповая тренировка");
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
  const me = await requireCoach();
  const slot = await db.query.trainingSlot.findFirst({ where: eq(s.trainingSlot.id, slotId), columns: { coachId: true } });
  if (!slot || (slot.coachId !== me.id && !isAdmin(me))) return { error: "Тренировка не найдена" };
  const n = await cancelSlot(slotId, reason.trim().slice(0, 200));
  await audit(me.id, "training.cancel", "training_slot", slotId, { notified: n });
  refresh();
  return { ok: n ? `Отменено. Записавшимся (${n}) ушло уведомление` : "Тренировка отменена" };
}

/** Отметить, пришёл ли человек */
export async function markBooking(bookingId: string, status: "ATTENDED" | "NO_SHOW" | "BOOKED"): Promise<St> {
  const me = await requireCoach();
  const b = await db.query.trainingBooking.findFirst({ where: eq(s.trainingBooking.id, bookingId), with: { slot: { columns: { coachId: true, startsAt: true } } } });
  if (!b || (b.slot.coachId !== me.id && !isAdmin(me))) return { error: "Запись не найдена" };
  if (b.status === "CANCELLED") return { error: "Запись отменена" };
  if (status !== "BOOKED" && +b.slot.startsAt > Date.now()) return { error: "Отметить можно после начала тренировки" };
  await db.update(s.trainingBooking).set({ status }).where(and(eq(s.trainingBooking.id, bookingId), ne(s.trainingBooking.status, "CANCELLED")));
  revalidatePath("/coach");
  return { ok: "Отмечено" };
}
