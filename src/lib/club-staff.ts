/**
 * Администраторы клубов (роль CLUB): выдача заказов с самовывозом и приём киёв в мастерскую своего клуба.
 *
 * Уведомления — в Telegram (если привязан в личном кабинете), иначе на почту.
 * В Telegram, как и админам, без имени, телефона и адреса покупателя (152-ФЗ): только номер, состав и что сделать.
 * Имя покупателя для сверки администратор видит в разделе «Клуб» на сайте после входа.
 */
import "server-only";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { listClubs, type ClubRow } from "@/lib/clubs";
import { SITE } from "@/lib/site";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Кто может открыть раздел «Клуб»: администратор клуба — только свой, владелец и менеджеры — любой */
export async function requireClubStaff() {
  const me = await getViewer();
  if (!me) redirect("/login?next=/club");
  if (getActiveBan(me)) redirect("/");
  const all = await listClubs();
  if (isAdmin(me)) return { me, clubs: all, admin: true };
  if (me.role !== "CLUB" || !me.clubId) redirect("/");
  const mine = all.filter((c) => c.id === me.clubId);
  return { me, clubs: mine, admin: false };
}

/** Для действий: можно ли этому сотруднику работать с заказом или заявкой этого клуба */
export async function assertClubAccess(clubId: string | null) {
  const me = await getViewer();
  if (!me || getActiveBan(me)) throw new Error("Нужно войти в аккаунт");
  if (isAdmin(me)) return me;
  if (me.role === "CLUB" && me.clubId && me.clubId === clubId) return me;
  throw new Error("Это заказ другого клуба");
}

/** Сообщение сотрудникам клуба: Telegram, а у кого не привязан — письмо */
export async function notifyClub(clubId: string | null, html: string, button?: { text: string; url: string }) {
  if (!clubId) return;
  try {
    const staff = await db.query.user.findMany({
      where: and(eq(s.user.role, "CLUB"), eq(s.user.clubId, clubId)),
      columns: { id: true, email: true, telegramChatId: true, bannedAt: true, bannedUntil: true },
    });
    const live = staff.filter((u) => !u.bannedAt || (u.bannedUntil && u.bannedUntil <= new Date()));
    if (!live.length) return;
    // На телефоны сотрудников клуба, если они включили уведомления
    void import("@/lib/push")
      .then((m) => m.pushToUsers(live.map((u) => u.id), m.fromHtml(html, m.sitePath(button?.url))))
      .catch(() => {});
    const { send, telegramEnabled } = await import("@/lib/telegram");
    const { mailEnabled, sendMail } = await import("@/lib/mail");
    const title = html.split("\n")[0].replace(/<[^>]+>/g, "").replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 120);
    for (const u of live) {
      if (telegramEnabled() && u.telegramChatId) {
        const ok = await send(u.telegramChatId, html, button ? [button] : undefined)
          .then(() => true)
          .catch(() => false);
        if (ok) continue;
      }
      if (mailEnabled()) await sendMail(u.email, title, title, html.replace(/\n/g, "<br>"), button).catch((e) => console.error("[club] письмо:", e));
    }
  } catch (e) {
    console.error("[club] уведомление:", e instanceof Error ? e.message : e);
  }
}

const clubUrl = (clubId: string) => `${SITE.url}/club?c=${clubId}`;

/** События заказа с самовывозом → клубу */
export async function notifyClubOrder(orderId: string, event: "paid" | "shipped" | "delivered" | "cancelled" | "refunded") {
  if (event !== "paid" && event !== "cancelled" && event !== "refunded") return;
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true } });
  if (!o || o.deliveryType !== "PICKUP" || !o.pickupClubId) return;
  const items = o.items.map((i) => `• ${esc(i.name)} × ${i.quantity}`).join("\n");
  const custom = o.items.some((i) => i.spec);
  if (event === "paid") {
    await notifyClub(
      o.pickupClubId,
      `📦 <b>Самовывоз к вам: заказ ${o.number}</b>\n\n${items}\n\n` +
        (custom ? "Кий делается на заказ — привезём, когда будет готов. " : "") +
        "Когда заказ будет в клубе, нажмите «Пришёл в клуб» — покупателю придёт сообщение, что можно забирать.",
      { text: "Открыть раздел клуба", url: clubUrl(o.pickupClubId) },
    );
  } else {
    await notifyClub(
      o.pickupClubId,
      `⛔️ <b>Заказ ${o.number} отменён</b> — не выдавайте его. Если товар уже в клубе, верните его в магазин.`,
      { text: "Открыть раздел клуба", url: clubUrl(o.pickupClubId) },
    );
  }
}

/** Заявки мастерской → клубу: принесут кий, кий готов к выдаче, отмена */
export async function notifyClubService(r: typeof s.serviceRequest.$inferSelect, event: "NEW" | "READY" | "CANCELLED") {
  if (!r.clubId) return;
  const works = r.items.map((i) => `• ${esc(i.name)}`).join("\n");
  if (event === "NEW" && r.handover === "CLUB") {
    await notifyClub(r.clubId, `🔧 <b>Принесут кий: заявка ${r.number}</b>\n\n${works}\n\nКогда клиент принесёт кий, нажмите «Кий принят».`, {
      text: "Открыть раздел клуба",
      url: clubUrl(r.clubId),
    });
  } else if (event === "READY" && r.returnMethod === "CLUB") {
    await notifyClub(
      r.clubId,
      `✅ <b>Кий по заявке ${r.number} готов</b>\n\nКлиент придёт за ним в клуб.` + (r.price && !r.paidAt ? " Работы ещё не оплачены — примите оплату при выдаче." : ""),
      { text: "Открыть раздел клуба", url: clubUrl(r.clubId) },
    );
  } else if (event === "CANCELLED" && (r.handover === "CLUB" || r.returnMethod === "CLUB")) {
    await notifyClub(r.clubId, `⛔️ <b>Заявка ${r.number} отменена.</b>`, { text: "Открыть раздел клуба", url: clubUrl(r.clubId) });
  }
}

/** Что сейчас ждёт клуб */
export async function clubQueue(club: ClubRow) {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [orders, service] = await Promise.all([
    db.query.order.findMany({
      where: and(
        eq(s.order.pickupClubId, club.id),
        or(inArray(s.order.status, ["PAID", "ASSEMBLING", "SHIPPED"]), and(eq(s.order.status, "DELIVERED"), gte(s.order.deliveredAt, weekAgo))),
      ),
      with: { items: true },
      orderBy: desc(s.order.createdAt),
      limit: 200,
    }),
    db.query.serviceRequest.findMany({
      where: and(
        eq(s.serviceRequest.clubId, club.id),
        or(inArray(s.serviceRequest.status, ["NEW", "RECEIVED", "IN_WORK", "READY"]), and(eq(s.serviceRequest.status, "DONE"), gte(s.serviceRequest.updatedAt, weekAgo))),
      ),
      orderBy: desc(s.serviceRequest.createdAt),
      limit: 200,
    }),
  ]);
  return {
    waiting: orders.filter((o) => o.status === "SHIPPED"),
    coming: orders.filter((o) => o.status === "PAID" || o.status === "ASSEMBLING"),
    given: orders.filter((o) => o.status === "DELIVERED"),
    bring: service.filter((r) => r.status === "NEW" && r.handover === "CLUB"),
    atMaster: service.filter((r) => r.status === "RECEIVED" || r.status === "IN_WORK"),
    ready: service.filter((r) => r.status === "READY" && r.returnMethod === "CLUB"),
    serviceDone: service.filter((r) => r.status === "DONE" && r.returnMethod === "CLUB"),
  };
}
