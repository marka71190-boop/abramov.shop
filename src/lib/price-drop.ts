/**
 * «Сообщить о снижении цены»: товар в избранном подешевел — письмо покупателю.
 *
 * Правила:
 *   • считаем от цены на момент добавления в избранное (или последнего письма); если цена росла — от новой, большей;
 *   • снижение — не меньше 3% и не меньше 100 ₽; товар открыт на сайте и есть в наличии;
 *   • только подписчикам с согласием на рекламу (письмо о цене — тоже реклама), днём, не чаще раза в сутки;
 *   • в Telegram — без названий товаров: только сколько подешевело.
 */
import { callNameOf } from "@/lib/names";
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { unsubscribeUrl } from "@/lib/campaigns";
import { rub } from "@/lib/format";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { send as tgSend, telegramEnabled } from "@/lib/telegram";
import { isPublic, isRetail } from "@/lib/visibility";

const mskHour = () => Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date()));
const abs = (url: string) => (url.startsWith("/") ? `${SITE.url}${url}` : url);

/** Текущая цена «от» по вариантам в наличии; null — товар не продаётся или закончился */
export async function currentPrices(productIds: string[]) {
  const out = new Map<string, { price: number; slug: string; name: string; image: string | null }>();
  if (!productIds.length) return out;
  const rows = await db.query.product.findMany({
    where: inArray(s.product.id, productIds),
    with: { category: true, variants: true, images: { orderBy: (im, { asc }) => asc(im.sortOrder), limit: 1 } },
  });
  for (const p of rows) {
    if (!isRetail(p) || (p.category && !isPublic(p.category))) continue;
    const prices = p.variants.filter((v) => v.isActive && v.stock > 0).map((v) => v.price ?? p.price);
    if (!prices.length) continue;
    out.set(p.id, { price: Math.min(...prices), slug: p.slug, name: p.name, image: p.images[0]?.url ?? null });
  }
  return out;
}

/** Цена, от которой считать снижение, — при добавлении в избранное */
export async function baselineFor(productId: string) {
  return (await currentPrices([productId])).get(productId)?.price ?? null;
}

const dropped = (now: number, was: number) => now <= was - 100 && now <= Math.floor(was * 0.97);

export async function priceDropAlerts(opts: { ignoreQuietHours?: boolean } = {}) {
  if (!opts.ignoreQuietHours) {
    const h = mskHour();
    if (h < 10 || h >= 21) return 0;
  }
  const favs = await db.select().from(s.favorite);
  if (!favs.length) return 0;
  const prices = await currentPrices([...new Set(favs.map((f) => f.productId))]);

  // 1. База: у новых — текущая цена; если цена выросла — поднимаем базу (снижение считаем от максимума)
  for (const f of favs) {
    const cur = prices.get(f.productId)?.price;
    if (cur == null) continue;
    if (f.notifiedPrice == null || cur > f.notifiedPrice) {
      await db
        .update(s.favorite)
        .set({ notifiedPrice: cur })
        .where(and(eq(s.favorite.userId, f.userId), eq(s.favorite.productId, f.productId)));
      f.notifiedPrice = cur;
    }
  }

  // 2. Кто ждёт письма
  const byUser = new Map<string, typeof favs>();
  for (const f of favs) {
    const cur = prices.get(f.productId)?.price;
    if (cur == null || f.notifiedPrice == null || !dropped(cur, f.notifiedPrice)) continue;
    byUser.set(f.userId, [...(byUser.get(f.userId) ?? []), f]);
  }
  if (!byUser.size) return 0;

  const dayAgo = new Date(Date.now() - 86400_000);
  const users = await db
    .select()
    .from(s.user)
    .where(
      and(
        inArray(s.user.id, [...byUser.keys()]),
        sql`exists (select 1 from ${s.consent} c where c.user_id = ${s.user.id} and c.kind = 'MARKETING' and c.revoked_at is null)`,
        sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`,
        // не чаще раза в сутки
        sql`not exists (select 1 from ${s.favorite} f2 where f2.user_id = ${s.user.id} and f2.notified_at > ${dayAgo})`,
      ),
    )
    .limit(50);

  let sent = 0;
  for (const u of users) {
    const items = byUser.get(u.id)!.map((f) => ({ f, p: prices.get(f.productId)!, was: f.notifiedPrice! }));
    const canMail = mailEnabled() && !isPlaceholderEmail(u.email);
    const canTg = !canMail && telegramEnabled() && !!u.telegramChatId;
    if (!canMail && !canTg) continue;
    // Сначала отмечаем — повторно про это же снижение не напишем
    for (const it of items) {
      await db
        .update(s.favorite)
        .set({ notifiedPrice: it.p.price, notifiedAt: new Date() })
        .where(and(eq(s.favorite.userId, u.id), eq(s.favorite.productId, it.f.productId)));
    }
    try {
      const unsub = unsubscribeUrl(u.id);
      const link = (slug: string, ch: string) => `${SITE.url}/product/${slug}?utm_source=${ch}&utm_medium=trigger&utm_campaign=price_drop`;
      if (canMail) {
        const first = callNameOf(u);
        const rows = items
          .slice(0, 8)
          .map(
            ({ p, was }) => `<tr>
<td style="padding:10px 12px 10px 0;width:64px">${p.image ? `<a href="${link(p.slug, "email")}"><img src="${escHtml(abs(p.image))}" width="56" height="56" alt="" style="display:block;object-fit:cover;background:#1a1a1d"></a>` : ""}</td>
<td style="padding:10px 0;font-size:14px"><a href="${link(p.slug, "email")}" style="color:#f3f2ef;text-decoration:none">${escHtml(p.name)}</a></td>
<td style="padding:10px 0 10px 12px;white-space:nowrap;text-align:right;font-size:14px"><span style="color:#7a7a80;text-decoration:line-through">${rub(was)}</span><br><b style="color:#dcbf83;font-size:16px">${rub(p.price)}</b><br><span style="color:#7bc28a;font-size:12px">−${Math.round(((was - p.price) / was) * 100)}%</span></td></tr>`,
          )
          .join("");
        const one = items.length === 1;
        const body =
          `${first ? `Здравствуйте, ${escHtml(first)}!<br><br>` : ""}${one ? "Товар из вашего избранного подешевел:" : "Товары из вашего избранного подешевели:"}` +
          `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 8px;border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a">${rows}</table>` +
          `<div style="color:#a3a3a8;font-size:13px;margin-top:12px">Цена и наличие — на момент письма. Товар не забронирован.</div>`;
        await sendMail(
          u.email,
          one ? `📉 ${items[0].p.name.slice(0, 60)} — теперь ${rub(items[0].p.price)}` : `📉 Подешевели товары из избранного: ${items.length}`,
          one ? "Цена снизилась" : "Цены снизились",
          body,
          { text: one ? "Посмотреть товар" : "Открыть избранное", url: one ? link(items[0].p.slug, "email") : `${SITE.url}/account#favorites` },
          {
            footerHtml: `Вы получили письмо, потому что добавили товар в избранное и подписаны на новости Abramov Shop. <a href="${unsub}" style="color:#a3a3a8">Отписаться</a>`,
            headers: {
              "List-Unsubscribe": `<${SITE.url}/api/unsubscribe?u=${encodeURIComponent(u.id)}&t=${unsub.split("&t=")[1]}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
        );
      } else {
        await tgSend(u.telegramChatId!, `📉 <b>Цена снизилась</b>\n\nТоваров из вашего избранного подешевело: ${items.length}.`, [
          { text: "Открыть избранное", url: `${SITE.url}/account?utm_source=telegram&utm_medium=trigger&utm_campaign=price_drop#favorites` },
          { text: "Отписаться", url: unsub },
        ]);
      }
      sent++;
    } catch (e) {
      console.error("[price-drop]", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
