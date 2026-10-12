/**
 * Бонусы: приветственные, ко дню рождения, сгорание по сроку и напоминания.
 *
 * Сгорание считается без отдельного учёта «остатков» каждого начисления:
 * бонусы тратятся начиная с тех, что сгорают раньше, поэтому сгореть может только
 * max(0, баланс − сумма ещё не истёкших начислений). Начисления без срока не сгорают никогда.
 */
import "server-only";
import { and, eq, gt, isNull, or, sql, sum } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDate, num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { telegramEnabled } from "@/lib/telegram";

type Reason = (typeof s.bonusReasonEnum.enumValues)[number];

/** Начислить бонусы (amount > 0) со сроком из настроек или своим. */
export async function creditBonus(userId: string, amount: number, reason: Reason, comment: string, opts: { days?: number | null; orderId?: string } = {}) {
  if (amount <= 0) return;
  const settings = await getSettings();
  const days = opts.days !== undefined ? opts.days : settings.loyalty.expiryDays || null;
  const expiresAt = days ? new Date(Date.now() + days * 86400_000) : null;
  await db.transaction(async (tx) => {
    await tx.update(s.user).set({ bonusBalance: sql`${s.user.bonusBalance} + ${amount}` }).where(eq(s.user.id, userId));
    await tx.insert(s.bonusTransaction).values({ userId, amount, reason, comment, expiresAt, orderId: opts.orderId ?? null });
  });
}

/** Сколько бонусов «живо» (не истекло) на момент `at`. */
async function liveAt(userId: string, at: Date) {
  const [r] = await db
    .select({ total: sum(s.bonusTransaction.amount) })
    .from(s.bonusTransaction)
    .where(
      and(
        eq(s.bonusTransaction.userId, userId),
        gt(s.bonusTransaction.amount, 0),
        or(isNull(s.bonusTransaction.expiresAt), gt(s.bonusTransaction.expiresAt, at)),
      ),
    );
  return Number(r?.total ?? 0);
}

/** Сколько бонусов сгорит к дате `at` и когда ближайшее сгорание. Для кабинета. */
export async function expiringSoon(userId: string, balance: number, days = 30) {
  if (balance <= 0) return null;
  const at = new Date(Date.now() + days * 86400_000);
  const amount = Math.max(0, balance - (await liveAt(userId, at)));
  if (!amount) return null;
  const [first] = await db
    .select({ d: s.bonusTransaction.expiresAt })
    .from(s.bonusTransaction)
    .where(and(eq(s.bonusTransaction.userId, userId), gt(s.bonusTransaction.amount, 0), gt(s.bonusTransaction.expiresAt, new Date())))
    .orderBy(s.bonusTransaction.expiresAt)
    .limit(1);
  return { amount, date: first?.d ?? at };
}

/** Списывает истёкшие бонусы у всех. Запускается раз в час. */
export async function expireBonuses() {
  const users = await db.select({ id: s.user.id, balance: s.user.bonusBalance }).from(s.user).where(gt(s.user.bonusBalance, 0));
  const now = new Date();
  for (const u of users) {
    const n = u.balance - (await liveAt(u.id, now));
    if (n <= 0) continue;
    await db.transaction(async (tx) => {
      const [cur] = await tx.select({ b: s.user.bonusBalance }).from(s.user).where(eq(s.user.id, u.id)).for("update");
      const take = Math.min(n, cur?.b ?? 0);
      if (take <= 0) return;
      await tx.update(s.user).set({ bonusBalance: sql`${s.user.bonusBalance} - ${take}` }).where(eq(s.user.id, u.id));
      await tx.insert(s.bonusTransaction).values({ userId: u.id, amount: -take, reason: "EXPIRED", comment: "Срок действия бонусов истёк" });
    });
  }
}

/** Текущая дата по Москве: { y, m, d } */
function mskToday() {
  const d = new Date(Date.now() + 3 * 3600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Подарок в день рождения. Указать дату нужно хотя бы за 30 дней — чтобы нельзя было «поставить сегодня». */
export async function birthdayBonuses() {
  const settings = await getSettings();
  const bonus = settings.loyalty.birthdayBonus;
  if (bonus <= 0) return;
  const { y, m, d } = mskToday();
  const leapFix = m === 2 && d === 28 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)); // 29 февраля → 28-го
  const users = await db
    .select()
    .from(s.user)
    .where(
      and(
        sql`extract(month from ${s.user.birthday}) = ${m}`,
        leapFix ? sql`extract(day from ${s.user.birthday}) in (28, 29)` : sql`extract(day from ${s.user.birthday}) = ${d}`,
        or(isNull(s.user.birthdayBonusYear), sql`${s.user.birthdayBonusYear} < ${y}`),
        sql`${s.user.birthdaySetAt} < now() - interval '30 days'`,
        isNull(s.user.bannedAt),
      ),
    );
  for (const u of users) {
    const [claimed] = await db
      .update(s.user)
      .set({ birthdayBonusYear: y })
      .where(and(eq(s.user.id, u.id), or(isNull(s.user.birthdayBonusYear), sql`${s.user.birthdayBonusYear} < ${y}`)))
      .returning({ id: s.user.id });
    if (!claimed) continue;
    await creditBonus(u.id, bonus, "BIRTHDAY", "С днём рождения!", { days: settings.loyalty.birthdayDays });
    await tell(u, `🎂 С днём рождения, ${u.name.split(" ")[0]}! Дарим <b>${num(bonus)}</b> бонусов — они действуют ${settings.loyalty.birthdayDays} дн.`);
  }
}

/** Напоминание в Telegram за 7 дней до сгорания (не чаще раза в 5 дней). */
export async function remindExpiring() {
  if (!telegramEnabled()) return;
  const users = await db
    .select()
    .from(s.user)
    .where(
      and(
        gt(s.user.bonusBalance, 0),
        sql`${s.user.telegramChatId} is not null`,
        eq(s.user.notifyTelegram, true),
        or(isNull(s.user.bonusReminderAt), sql`${s.user.bonusReminderAt} < now() - interval '5 days'`),
      ),
    );
  for (const u of users) {
    const soon = await expiringSoon(u.id, u.bonusBalance, 7);
    if (!soon) continue;
    await db.update(s.user).set({ bonusReminderAt: new Date() }).where(eq(s.user.id, u.id));
    await tell(u, `⏳ ${num(soon.amount)} бонусов сгорят ${fmtDate(soon.date)}. Успейте потратить — бонусами можно оплатить часть заказа.`);
  }
}

async function tell(u: typeof s.user.$inferSelect, html: string) {
  if (!u.telegramChatId || !u.notifyTelegram || !telegramEnabled()) return;
  const { send } = await import("@/lib/telegram");
  await send(u.telegramChatId, html, [{ text: "В магазин", url: `${SITE.url}/#catalog` }]).catch((e) => console.error("[bonus] telegram:", e.message));
}
