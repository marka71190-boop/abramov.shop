/**
 * «Оцените покупку»: через N дней после получения заказа (админка → Настройки) — одно письмо
 * со звёздами к каждому товару. Клик по звезде открывает страницу товара с уже выбранной оценкой.
 *
 * Правила:
 *   • одно письмо на заказ (order.review_requested_at), заказы старше 30 дней после получения — не трогаем;
 *   • только товары, которые ещё открыты на сайте, о которых покупатель ещё не писал и которые не вернул;
 *   • только днём (10:00–21:00 по Москве);
 *   • письмо — служебное, о конкретном заказе: без рекламы других товаров;
 *   • в Telegram (если почты нет) — только номер заказа и бонусы, без названий товаров.
 */
import { callNameOf } from "@/lib/names";
import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { num } from "@/lib/format";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { send as tgSend, telegramEnabled } from "@/lib/telegram";
import { publicWhere, retailWhere } from "@/lib/visibility";

const mskHour = () => Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date()));
const abs = (url: string) => (url.startsWith("/") ? `${SITE.url}${url}` : url);

/** Товары заказа, о которых ещё можно попросить отзыв. */
async function reviewable(orderId: string, userId: string) {
  const items = await db
    .select({ itemId: s.orderItem.id, product: s.product })
    .from(s.orderItem)
    .innerJoin(s.product, eq(s.product.id, s.orderItem.productId))
    .leftJoin(s.category, eq(s.category.id, s.product.categoryId))
    .where(and(eq(s.orderItem.orderId, orderId), retailWhere(s.product), or(isNull(s.product.categoryId), publicWhere(s.category))));
  if (!items.length) return [];
  const productIds = [...new Set(items.map((i) => i.product.id))];
  const [reviewed, returned, images] = await Promise.all([
    db
      .select({ id: s.review.productId })
      .from(s.review)
      .where(and(eq(s.review.userId, userId), inArray(s.review.productId, productIds))),
    db
      .select({ id: s.returnItem.orderItemId })
      .from(s.returnItem)
      .innerJoin(s.returnRequest, eq(s.returnRequest.id, s.returnItem.requestId))
      .where(and(eq(s.returnRequest.orderId, orderId), sql`${s.returnRequest.status} not in ('REJECTED','CANCELLED')`)),
    db
      .select({ productId: s.productImage.productId, url: s.productImage.url })
      .from(s.productImage)
      .where(inArray(s.productImage.productId, productIds))
      .orderBy(s.productImage.sortOrder),
  ]);
  const skipProduct = new Set(reviewed.map((r) => r.id));
  const skipItem = new Set(returned.map((r) => r.id));
  const image = new Map<string, string>();
  for (const im of images) if (!image.has(im.productId)) image.set(im.productId, im.url);
  const out: { id: string; slug: string; name: string; image: string | null }[] = [];
  for (const i of items) {
    if (skipItem.has(i.itemId) || skipProduct.has(i.product.id)) continue;
    skipProduct.add(i.product.id);
    out.push({ id: i.product.id, slug: i.product.slug, name: i.product.name, image: image.get(i.product.id) ?? null });
  }
  return out;
}

function stars(slug: string) {
  return [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${SITE.url}/product/${encodeURIComponent(slug)}?review=${n}&amp;utm_source=email&amp;utm_medium=trigger&amp;utm_campaign=review_request#reviews" title="${n} из 5" style="color:#dcbf83;text-decoration:none;font-size:26px;line-height:1;padding:0 2px">★</a>`,
    )
    .join("");
}

export async function requestReviews(opts: { ignoreQuietHours?: boolean; now?: Date } = {}) {
  const settings = await getSettings();
  const days = settings.reviews.requestDays;
  if (!days) return 0;
  if (!opts.ignoreQuietHours) {
    const h = mskHour();
    if (h < 10 || h >= 21) return 0;
  }
  if (!mailEnabled() && !telegramEnabled()) return 0;

  const now = (opts.now ?? new Date()).getTime();
  const rows = await db
    .select({ order: s.order, user: s.user })
    .from(s.order)
    .innerJoin(s.user, eq(s.user.id, s.order.userId))
    .where(
      and(
        eq(s.order.status, "DELIVERED"),
        isNull(s.order.reviewRequestedAt),
        isNotNull(s.order.deliveredAt),
        lt(s.order.deliveredAt, new Date(now - days * 86400_000)),
        gt(s.order.deliveredAt, new Date(now - 30 * 86400_000)),
        sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`,
      ),
    )
    .orderBy(s.order.deliveredAt)
    .limit(30);

  const bonus = settings.loyalty.reviewBonus;
  let sent = 0;
  for (const { order: o, user } of rows) {
    // Отмечаем сразу и только если никто не успел раньше — письмо по заказу уходит один раз
    const claimed = await db
      .update(s.order)
      .set({ reviewRequestedAt: new Date() })
      .where(and(eq(s.order.id, o.id), isNull(s.order.reviewRequestedAt)))
      .returning({ id: s.order.id });
    if (!claimed.length) continue;
    try {
      const products = await reviewable(o.id, user.id);
      if (!products.length) continue;
      const first = callNameOf(user);
      const bonusLine = bonus > 0 ? `За каждый одобренный отзыв начислим <b>${num(bonus)} бонусов</b>.` : "";

      if (mailEnabled() && !isPlaceholderEmail(user.email)) {
        const list = products
          .slice(0, 8)
          .map(
            (p) => `<tr>
<td style="padding:12px 12px 12px 0;width:64px;vertical-align:top">${p.image ? `<a href="${SITE.url}/product/${encodeURIComponent(p.slug)}#reviews"><img src="${escHtml(abs(p.image))}" width="56" height="56" alt="" style="display:block;object-fit:cover;background:#1a1a1d"></a>` : ""}</td>
<td style="padding:12px 0;color:#f3f2ef;font-size:14px;vertical-align:top">${escHtml(p.name)}<div style="margin-top:6px;white-space:nowrap">${stars(p.slug)}</div></td></tr>`,
          )
          .join("");
        const body =
          `${first ? `Здравствуйте, ${escHtml(first)}!<br><br>` : ""}Заказ №${escHtml(o.number)} у вас уже несколько дней. Как вам покупка? ` +
          `Нажмите на звезду — откроется страница товара, где можно дописать пару слов и добавить фото.` +
          `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 8px;border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a">${list}</table>` +
          (bonusLine ? `<div style="margin-top:8px">${bonusLine}</div>` : "") +
          `<div style="color:#a3a3a8;font-size:13px;margin-top:12px">Если что-то не так с заказом — просто ответьте на это письмо или напишите нам в Telegram, разберёмся.</div>`;
        const top = products[0];
        await sendMail(
          user.email,
          `Как вам заказ №${o.number}?`,
          "Оцените покупку",
          body,
          { text: "Оставить отзыв", url: `${SITE.url}/product/${encodeURIComponent(top.slug)}?utm_source=email&utm_medium=trigger&utm_campaign=review_request#reviews` },
          {
            footerHtml: "Это письмо — по вашему заказу, мы пришлём его один раз.",
            text:
              `Оцените покупку\n\n${first ? `Здравствуйте, ${first}!\n\n` : ""}Заказ №${o.number} у вас уже несколько дней. Как вам покупка? Оставить отзыв:\n\n` +
              products
                .slice(0, 8)
                .map((p) => `${p.name}\n${SITE.url}/product/${encodeURIComponent(p.slug)}#reviews`)
                .join("\n\n") +
              (bonus > 0 ? `\n\nЗа каждый одобренный отзыв начислим ${num(bonus)} бонусов.` : "") +
              `\n\nЕсли что-то не так с заказом — ответьте на это письмо или напишите нам в Telegram.\n\n---\nЭто письмо — по вашему заказу, мы пришлём его один раз.`,
          },
        );
        sent++;
      } else if (telegramEnabled() && user.telegramChatId) {
        // В Telegram — только номер заказа и бонусы
        await tgSend(
          user.telegramChatId,
          `⭐ <b>Как вам заказ №${escHtml(o.number)}?</b>\n\nОцените покупку на сайте — это помогает другим выбрать.${bonus > 0 ? `\nЗа каждый одобренный отзыв — ${num(bonus)} бонусов.` : ""}`,
          [{ text: "Оставить отзыв", url: `${SITE.url}/order/${encodeURIComponent(o.number)}?utm_source=telegram&utm_medium=trigger&utm_campaign=review_request` }],
        );
        sent++;
      }
    } catch (e) {
      console.error("[review-request]", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
