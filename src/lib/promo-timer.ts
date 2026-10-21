/**
 * Акции по таймеру: промокод из рассылки действует N часов с момента, когда письмо (или сообщение в Telegram)
 * ушло конкретному покупателю. Так у каждого честные N часов, даже если рассылка растянулась.
 */
import "server-only";
import { and, eq, max } from "drizzle-orm";
import { db, schema as s } from "@/db";

type Promo = Pick<typeof s.promoCode.$inferSelect, "id" | "personalHours">;

/** До какого момента промокод действует для этого покупателя; null — рассылку с ним не получал. */
export async function personalDeadline(p: Promo, userId: string): Promise<Date | null> {
  if (!p.personalHours) return null;
  const [r] = await db
    .select({ at: max(s.campaignRecipient.sentAt) })
    .from(s.campaignRecipient)
    .innerJoin(s.campaign, eq(s.campaign.id, s.campaignRecipient.campaignId))
    .where(and(eq(s.campaign.promoCodeId, p.id), eq(s.campaignRecipient.userId, userId), eq(s.campaignRecipient.status, "SENT")));
  return r?.at ? new Date(+new Date(r.at) + p.personalHours * 3600_000) : null;
}

/** «21:30» по Москве (и дата, если не сегодня) */
export function mskUntil(d: Date) {
  const opts = { timeZone: "Europe/Moscow" } as const;
  const time = d.toLocaleTimeString("ru-RU", { ...opts, hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toLocaleDateString("ru-RU", opts) === new Date().toLocaleDateString("ru-RU", opts);
  return sameDay ? `${time} по Москве` : `${d.toLocaleDateString("ru-RU", { ...opts, day: "numeric", month: "long" })}, ${time} по Москве`;
}
