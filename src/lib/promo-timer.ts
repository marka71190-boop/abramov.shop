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

const WEEKDAY_GEN = ["воскресенья", "понедельника", "вторника", "среды", "четверга", "пятницы", "субботы"];

/** Для темы письма: «до 21:30», «до завтра, 21:30», «до пятницы, 21:30» или «до 2 ноября» (по Москве) */
export function untilShort(d: Date) {
  const msk = (x: Date) => new Date(+x + 3 * 3600_000);
  const day = (x: Date) => Math.floor(+msk(x) / 86400_000);
  const diff = day(d) - day(new Date());
  const time = d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  if (diff <= 0) return `до ${time}`;
  if (diff === 1) return `до завтра, ${time}`;
  if (diff < 7) return `до ${WEEKDAY_GEN[msk(d).getUTCDay()]}, ${time}`;
  return `до ${d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" })}`;
}
