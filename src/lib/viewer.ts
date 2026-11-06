import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { ALL_ITEMS, canSee, sectionOf } from "@/lib/admin-sections";
import { hasRole, rolesOf } from "@/lib/roles";
import { auth } from "@/lib/auth";

export type UserRow = typeof s.user.$inferSelect;

/** Текущий посетитель: сессия + полная строка пользователя (роль, бан, бонусы). Один запрос на страницу. */
export const getViewer = cache(async (): Promise<UserRow | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, session.user.id) });
  return u ?? null;
});

/** Владелец или менеджер. Заблокированный сотрудник доступа к админке не имеет, пока бан действует. */
export function isAdmin(u: (Pick<UserRow, "role"> & Partial<Pick<UserRow, "bannedAt" | "bannedUntil">>) | null | undefined) {
  if (u?.role !== "OWNER" && u?.role !== "MANAGER") return false;
  return !u.bannedAt || (!!u.bannedUntil && u.bannedUntil <= new Date());
}

export interface ActiveBan {
  reason: string;
  until: Date | null; // null — навсегда
  ticket: string | null;
}

/** Действующий бан. Истёкший бан считается снятым автоматически. */
export function getActiveBan(u: UserRow | null | undefined, now = new Date()): ActiveBan | null {
  if (!u?.bannedAt) return null;
  if (u.bannedUntil && u.bannedUntil <= now) return null;
  return { reason: u.banReason || "Нарушение правил магазина", until: u.bannedUntil, ticket: u.banTicket };
}

/** Для страниц, куда пускаем только вошедших. */
export async function requireUser(next = "/account") {
  const u = await getViewer();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  // Телефон кассы — только касса
  if (u.isDevice) redirect("/kassa");
  return u;
}

/** Для действий покупателя (заказ, бонусы): бан запрещает. */
export async function requireActiveUser() {
  const u = await getViewer();
  if (!u) throw new Error("Нужно войти в аккаунт");
  if (u.isDevice) throw new Error("Это аккаунт кассы — заказы и кабинет на нём недоступны");
  if (getActiveBan(u)) throw new Error("Аккаунт заблокирован");
  return u;
}

/** Руководитель: смотрит отчёты в админке, ничего не меняет */
export function isDirector(u: (Pick<UserRow, "role"> & Partial<Pick<UserRow, "bannedAt" | "bannedUntil">>) | null | undefined) {
  if (u?.role !== "DIRECTOR") return false;
  return !u.bannedAt || (!!u.bannedUntil && u.bannedUntil <= new Date());
}

/** Видит деньги: выручку, прибыль, себестоимость */
export const seesMoney = (u: Pick<UserRow, "role" | "extraRoles">) => u.role === "OWNER" || hasRole(u, "DIRECTOR");

/** Открыт ли менеджеру раздел админки (владелец выбирает разделы в карточке сотрудника) */
export function hasSection(u: Pick<UserRow, "role" | "extraRoles" | "adminSections">, key: string) {
  const item = ALL_ITEMS.find((i) => i.key === key);
  return !!item && canSee(rolesOf(u), u.adminSections, item);
}

/**
 * Для админки. Владелец — всё, менеджер — всё, кроме настроек и выдачи ролей,
 * а если владелец выбрал ему разделы — только их.
 */
export async function requireAdmin(level: "MANAGER" | "OWNER" | "MONEY" = "MANAGER") {
  const u = await getViewer();
  if (!u) redirect("/login?next=/admin");
  if (isDirector(u)) {
    // Руководитель: только просмотр страниц админки. Любое действие (кнопка, форма) и запросы вне админки — нельзя
    const h = await headers();
    const path = h.get("x-admin-path");
    if (level === "OWNER" || h.get("next-action") || !path) redirect("/admin?readonly=1");
    const item = sectionOf(path);
    if (item && !canSee(rolesOf(u), u.adminSections, item)) redirect("/admin?closed=1");
    return u;
  }
  // MONEY — финансы и аналитика: владелец и руководитель (в том числе менеджер, который ещё и руководитель)
  if (!isAdmin(u) || (level === "OWNER" && u.role !== "OWNER") || (level === "MONEY" && !seesMoney(u))) redirect("/");
  if (u.role === "MANAGER" && u.adminSections?.length) {
    // Путь страницы передаёт src/proxy.ts; вне админки (API, кабинеты) заголовка нет
    const path = (await headers()).get("x-admin-path");
    const item = path ? sectionOf(path) : null;
    if (item && !canSee(rolesOf(u), u.adminSections, item)) redirect("/admin?closed=1");
  }
  return u;
}

/** Касса: кассир, менеджер или владелец (без действующего бана) */
export async function requireCashier(next = "/kassa") {
  const u = await getViewer();
  if (!u) redirect(next === "/kassa" ? "/kassa/login" : `/login?next=${encodeURIComponent(next)}`);
  // Отключённый телефон кассы — на страницу входа (сессии при отключении удаляются, это на всякий случай)
  if (u.isDevice && getActiveBan(u)) redirect("/kassa/login?off=1");
  const admin = isAdmin(u);
  if (!admin && !(hasRole(u, "CASHIER") && !getActiveBan(u))) redirect("/");
  return { me: u, admin };
}
