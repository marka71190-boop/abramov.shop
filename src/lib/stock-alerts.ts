import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";

/** Остаток товара по активным вариантам. */
export async function productStock(productId: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${s.productVariant.stock}), 0)::int` })
    .from(s.productVariant)
    .where(and(eq(s.productVariant.productId, productId), eq(s.productVariant.isActive, true)));
  return r?.n ?? 0;
}

/** Товар снова в наличии — уведомление в приложение и в Telegram, а у кого нет ни того ни другого — на почту. */
export async function notifyBackInStock(productId: string) {
  const p = await db.query.product.findFirst({ where: eq(s.product.id, productId), columns: { name: true, slug: true } });
  if (!p) return 0;
  const subs = await db.query.stockSubscription.findMany({
    where: and(eq(s.stockSubscription.productId, productId), isNull(s.stockSubscription.notifiedAt)),
  });
  if (!subs.length) return 0;
  const url = `${SITE.url}/product/${p.slug}`;
  const [{ notifyUser, esc }, { sendMail }, { pushToUser }] = await Promise.all([import("@/lib/telegram"), import("@/lib/mail"), import("@/lib/push")]);
  for (const sub of subs) {
    let sent = false;
    if (sub.userId) {
      // Просил сам — это не реклама: шлём всем, кто включил уведомления в приложении
      const pushed = await pushToUser(sub.userId, { title: "Снова в наличии", body: `«${p.name}» можно заказать — успейте`, url: `/product/${p.slug}`, tag: `stock-${productId.slice(0, 8)}` }).catch(() => 0);
      sent = pushed > 0;
    }
    if (sub.userId) sent = (await notifyUser(sub.userId, `🔥 «${esc(p.name)}» снова в наличии! Успейте заказать.`, { text: "Открыть товар", url })) || sent;
    if (!sent && sub.email) {
      await sendMail(sub.email, `«${p.name}» снова в наличии`, "Товар снова в наличии", `«${esc(p.name)}», который вы ждали, снова можно заказать.`, {
        text: "Открыть товар",
        url,
      }).catch(() => {});
    }
    await db.update(s.stockSubscription).set({ notifiedAt: new Date() }).where(eq(s.stockSubscription.id, sub.id));
  }
  return subs.length;
}
