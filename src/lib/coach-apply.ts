/** Заявки «Стать тренером»: подача, одобрение (роль тренера + профиль), отказ */
import "server-only";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";
import { rolesOf, splitRoles } from "@/lib/roles";
import { SITE } from "@/lib/site";
import { ensureCoachProfile } from "@/lib/trainings";

export const GAMES = ["Свободная пирамида", "Динамичная пирамида", "Комбинированная пирамида", "Московская пирамида", "Невская пирамида"];
export const RANKS = ["Мастер спорта международного класса", "Мастер спорта", "Кандидат в мастера спорта", "1 разряд", "Без звания"];

export type ApplicationRow = typeof s.coachApplication.$inferSelect;

export class ApplyError extends Error {}

export async function lastApplication(userId: string) {
  return (await db.query.coachApplication.findFirst({ where: eq(s.coachApplication.userId, userId), orderBy: desc(s.coachApplication.createdAt) })) ?? null;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function submitApplication(userId: string, a: Omit<typeof s.coachApplication.$inferInsert, "id" | "userId" | "status" | "createdAt">) {
  const last = await lastApplication(userId);
  if (last?.status === "NEW") throw new ApplyError("Ваша заявка уже на рассмотрении — мы ответим в ближайшее время");
  const [row] = await db.insert(s.coachApplication).values({ ...a, userId }).returning();
  // Владельцу — без персональных данных: только сам факт и ссылка
  void import("@/lib/telegram")
    .then((t) => t.notifyAdmins(`🎱 <b>Новая заявка тренера</b>\nПосмотрите и ответьте в админке.`, { text: "Открыть заявки", url: `${SITE.url}/admin/coaches#applications` }))
    .catch(() => {});
  return row;
}

async function tell(userId: string, title: string, html: string, button: { text: string; url: string }) {
  const u = await db.query.user.findFirst({ where: eq(s.user.id, userId), columns: { email: true } });
  const { notifyUser } = await import("@/lib/telegram");
  void notifyUser(userId, `${title}\n\n${html.replace(/<br>/g, "\n")}`, button).catch(() => {});
  if (u?.email) {
    const { sendMail } = await import("@/lib/mail");
    void sendMail(u.email, title, title, html, button).catch(() => {});
  }
}

/** Одобрить: роль тренера (к уже имеющимся), профиль с данными из заявки */
export async function approveApplication(id: string, byId: string, reply: string | null) {
  const a = await db.query.coachApplication.findFirst({ where: eq(s.coachApplication.id, id) });
  if (!a || a.status !== "NEW") throw new ApplyError("Заявка уже рассмотрена");
  const u = await db.query.user.findFirst({ where: eq(s.user.id, a.userId), columns: { role: true, extraRoles: true } });
  if (!u) throw new ApplyError("Аккаунт заявителя удалён");
  const { role, extraRoles } = splitRoles([...rolesOf(u), "COACH"]);
  await db.update(s.user).set({ role, extraRoles }).where(eq(s.user.id, a.userId));
  const profile = await ensureCoachProfile(a.userId);
  const clubs = a.clubIds.length ? await db.query.club.findMany({ where: eq(s.club.isActive, true), columns: { id: true } }) : [];
  await db
    .update(s.coachProfile)
    .set({
      displayName: a.fullName || profile.displayName,
      title: profile.title || [a.rank && a.rank !== "Без звания" ? a.rank : null, "тренер по русскому бильярду"].filter(Boolean).join(", "),
      about: profile.about || [a.about, a.achievements ? `Достижения: ${a.achievements}` : null].filter(Boolean).join("\n\n"),
      games: a.games.length ? a.games.join(", ") : profile.games,
      clubIds: a.clubIds.filter((c) => clubs.some((x) => x.id === c)),
      ...(a.pricePerHour ? { pricePerHour: a.pricePerHour } : {}),
    })
    .where(eq(s.coachProfile.userId, a.userId));
  await db.update(s.coachApplication).set({ status: "APPROVED", reply, reviewedById: byId, reviewedAt: new Date() }).where(eq(s.coachApplication.id, id));
  await tell(
    a.userId,
    "Заявка тренера одобрена",
    `Добро пожаловать в команду тренеров Abramov!<br>Откройте кабинет тренера: проверьте профиль, добавьте фото и рабочее время — после этого ученики смогут записываться.${reply ? `<br><br>${esc(reply)}` : ""}`,
    { text: "Кабинет тренера", url: `${SITE.url}/coach?tab=profile` },
  );
}

export async function rejectApplication(id: string, byId: string, reply: string | null) {
  const a = await db.query.coachApplication.findFirst({ where: eq(s.coachApplication.id, id) });
  if (!a || a.status !== "NEW") throw new ApplyError("Заявка уже рассмотрена");
  await db.update(s.coachApplication).set({ status: "REJECTED", reply, reviewedById: byId, reviewedAt: new Date() }).where(eq(s.coachApplication.id, id));
  await tell(a.userId, "Ответ по заявке тренера", `Спасибо за интерес! Сейчас мы не можем разместить вас как тренера.${reply ? `<br><br>${esc(reply)}` : ""}`, {
    text: "Подробнее",
    url: `${SITE.url}/trenirovki/stat-trenerom`,
  });
}

/** Рассмотренные заявки старше года удаляем: в них телефон и ФИО (152-ФЗ — не храним дольше нужного) */
export async function purgeOldApplications() {
  await db.delete(s.coachApplication).where(and(ne(s.coachApplication.status, "NEW"), lt(s.coachApplication.reviewedAt, new Date(Date.now() - 365 * 86400_000))));
}

export const clubsLine = (clubs: { name: string; address: string | null }[]) => clubs.map((c) => clubTitle(c)).join("; ");
