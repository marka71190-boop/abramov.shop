/**
 * Удаление персональных данных всех пользователей, кроме одного (владельца, который нажал кнопку).
 *
 * Что происходит:
 *  - аккаунты удаляются целиком: сессии, входы, бонусы, адреса, избранное, отзывы, корзины,
 *    подписки на рассылку и на «появится в наличии» (каскадом в базе);
 *  - журнал согласий, ожидающие подтверждения почты и сброса пароля — удаляются;
 *  - заказы остаются для учёта (товары, суммы, статусы, трек), но имя, телефон, почта, адрес,
 *    индекс и комментарий стираются; ответ ЮKassa в оплате — тоже;
 *  - в заявках на возврат стираются комментарий и фото покупателя;
 *  - в журнале действий админов — IP и подробности по удалённым пользователям;
 *  - в подарочных сертификатах — почта покупателя, имена, почта получателя и пожелание
 *    (сами сертификаты продолжают действовать).
 *
 * Действие необратимо.
 */
import "server-only";
import { and, eq, inArray, isNull, ne, or, sql, type Column } from "drizzle-orm";
import { db, schema as s } from "@/db";

const ANON = "Удалено";
const MEDIA_RE = /\/media\/([A-Za-z0-9_-]+)/;

export interface PurgeStats {
  users: number;
  orders: number;
  consents: number;
  reviews: number;
  returns: number;
  /** Заказы в работе (ждут оплаты, оплачены, собираются) — после обезличивания их не отправить */
  active?: number;
}

/** Сколько будет затронуто — для экрана подтверждения. */
export async function purgePreview(keepId: string): Promise<PurgeStats> {
  const [users, orders, consents, reviews, returns, active] = await Promise.all([
    db.$count(s.user, ne(s.user.id, keepId)),
    db.$count(s.order, and(or(isNull(s.order.userId), ne(s.order.userId, keepId)), ne(s.order.customerName, ANON))),
    db.$count(s.consent, or(isNull(s.consent.userId), ne(s.consent.userId, keepId))),
    db.$count(s.review, ne(s.review.userId, keepId)),
    db.$count(s.returnRequest, or(isNull(s.returnRequest.userId), ne(s.returnRequest.userId, keepId))),
    db.$count(
      s.order,
      and(or(isNull(s.order.userId), ne(s.order.userId, keepId)), inArray(s.order.status, ["AWAITING_PAYMENT", "PAID", "ASSEMBLING"])),
    ),
  ]);
  return { users, orders, consents, reviews, returns, active };
}

export async function purgePersonalData(keepId: string): Promise<PurgeStats> {
  return db.transaction(async (tx) => {
    const others = (col: Column) => or(isNull(col), ne(col, keepId));

    // Фото покупателей в отзывах и заявках на возврат — удалим и сами файлы
    const reviewPhotos = await tx.select({ photos: s.review.photos }).from(s.review).where(ne(s.review.userId, keepId));
    const returnRows = await tx
      .select({ id: s.returnRequest.id, photos: s.returnRequest.photos })
      .from(s.returnRequest)
      .where(others(s.returnRequest.userId));
    const mediaIds = new Set<string>();
    for (const r of [...reviewPhotos, ...returnRows]) for (const p of r.photos) {
      const m = MEDIA_RE.exec(p);
      if (m) mediaIds.add(m[1]);
    }
    // Не трогаем картинки, которые вдруг используются в каталоге
    if (mediaIds.size) {
      const used = await tx.execute<{ url: string }>(sql`
        select url from product_image
        union all select image as url from category where image is not null`);
      for (const u of used.rows) {
        const m = MEDIA_RE.exec(u.url);
        if (m) mediaIds.delete(m[1]);
      }
    }

    // Заказы: обезличиваем
    const orderIds = (await tx.select({ id: s.order.id }).from(s.order).where(others(s.order.userId))).map((r) => r.id);
    let orders = 0;
    if (orderIds.length) {
      const r = await tx
        .update(s.order)
        .set({ customerName: ANON, phone: "", email: "", comment: null, address: null, postalCode: null, updatedAt: new Date() })
        .where(inArray(s.order.id, orderIds))
        .returning({ id: s.order.id });
      orders = r.length;
      await tx.update(s.payment).set({ raw: null }).where(inArray(s.payment.orderId, orderIds));
    }

    // Возвраты: комментарий и фото покупателя
    if (returnRows.length) {
      await tx
        .update(s.returnRequest)
        .set({ comment: "", photos: [] })
        .where(inArray(s.returnRequest.id, returnRows.map((r) => r.id)));
    }

    // Подарочные сертификаты остаются действовать (код и баланс — деньги покупателя),
    // но почта покупателя, имена, почта получателя и пожелание стираются
    await tx
      .update(s.giftCard)
      .set({ buyerEmail: null, recipientName: null, recipientEmail: null, senderName: null, message: null })
      .where(or(isNull(s.giftCard.buyerId), ne(s.giftCard.buyerId, keepId)));

    // Журнал согласий и токены
    const consents = (await tx.delete(s.consent).where(others(s.consent.userId)).returning({ id: s.consent.id })).length;
    await tx.delete(s.verification);
    await tx.delete(s.stockSubscription).where(or(isNull(s.stockSubscription.userId), ne(s.stockSubscription.userId, keepId)));

    // Журнал действий: IP чужих сессий и подробности по удаляемым пользователям
    const removed = (await tx.select({ id: s.user.id }).from(s.user).where(ne(s.user.id, keepId))).map((r) => r.id);
    await tx.update(s.auditLog).set({ ip: null }).where(or(isNull(s.auditLog.actorId), ne(s.auditLog.actorId, keepId)));
    if (removed.length) {
      await tx
        .update(s.auditLog)
        .set({ details: null })
        .where(and(eq(s.auditLog.entity, "user"), inArray(s.auditLog.entityId, removed)));
    }
    await tx.update(s.auditLog).set({ details: null }).where(eq(s.auditLog.action, "consent.export"));

    // Аккаунты (каскадом уходят сессии, входы, бонусы, адреса, избранное, отзывы, корзины, рассылки)
    const reviews = await tx.$count(s.review, ne(s.review.userId, keepId));
    const users = (await tx.delete(s.user).where(ne(s.user.id, keepId)).returning({ id: s.user.id })).length;
    await tx.update(s.user).set({ referredById: null }).where(eq(s.user.id, keepId));

    if (mediaIds.size) await tx.delete(s.media).where(inArray(s.media.id, [...mediaIds]));

    return { users, orders, consents, reviews, returns: returnRows.length };
  });
}
