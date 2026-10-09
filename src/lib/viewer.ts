import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";

export type UserRow = typeof s.user.$inferSelect;

/** Текущий посетитель: сессия + полная строка пользователя (роль, бан, бонусы). Один запрос на страницу. */
export const getViewer = cache(async (): Promise<UserRow | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, session.user.id) });
  return u ?? null;
});

export function isAdmin(u: Pick<UserRow, "role"> | null | undefined) {
  return u?.role === "OWNER" || u?.role === "MANAGER";
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
  return u;
}

/** Для действий покупателя (заказ, бонусы): бан запрещает. */
export async function requireActiveUser() {
  const u = await getViewer();
  if (!u) throw new Error("Нужно войти в аккаунт");
  if (getActiveBan(u)) throw new Error("Аккаунт заблокирован");
  return u;
}

/** Для админки. Владелец — всё, менеджер — всё, кроме настроек и выдачи ролей. */
export async function requireAdmin(level: "MANAGER" | "OWNER" = "MANAGER") {
  const u = await getViewer();
  if (!u) redirect("/login?next=/admin");
  if (!isAdmin(u) || (level === "OWNER" && u.role !== "OWNER")) redirect("/");
  return u;
}
