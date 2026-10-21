/**
 * Изготовление кия «Чемпион» по заказу: этапы для покупателя.
 *   • «Принят в работу» — сам, когда заказ оплачен;
 *   • «Мастер работает» — мастер отмечает в админке (можно несколько раз: с фото и комментарием — как новости);
 *   • «Кий готов» — с фото готового кия; дальше обычная отправка СДЭК.
 * На каждом этапе покупателю приходит письмо; в Telegram — только номер заказа и этап (без комментариев).
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { fmtDate } from "@/lib/format";
import { isPlaceholderEmail, SITE } from "@/lib/site";

export type Stage = "ACCEPTED" | "IN_WORK" | "READY";

export const STAGE_LABEL: Record<Stage, string> = {
  ACCEPTED: "Принят в работу",
  IN_WORK: "Мастер работает над кием",
  READY: "Кий готов",
};

const abs = (url: string) => (url.startsWith("/") ? `${SITE.url}${url}` : url);

/** В заказе есть кий на заказ? */
export async function isCueOrder(orderId: string) {
  const items = await db.select({ spec: s.orderItem.spec }).from(s.orderItem).where(eq(s.orderItem.orderId, orderId));
  return items.some((i) => !!i.spec);
}

export async function productionEvents(orderId: string) {
  return db.query.productionEvent.findMany({ where: eq(s.productionEvent.orderId, orderId), orderBy: asc(s.productionEvent.createdAt) });
}

/** Ориентировочная дата готовности: оплата + срок изготовления из конструктора */
export async function expectedReady(paidAt: Date | null) {
  if (!paidAt) return null;
  const { getCueConfig } = await import("@/lib/cue");
  return new Date(+new Date(paidAt) + (await getCueConfig()).leadDays * 86400_000);
}

/** Заказ оплачен — кий принят в работу (без отдельного письма: о сроке сказано в письме об оплате). */
export async function onOrderPaid(orderId: string) {
  if (!(await isCueOrder(orderId))) return;
  const has = await db.query.productionEvent.findFirst({ where: and(eq(s.productionEvent.orderId, orderId), eq(s.productionEvent.stage, "ACCEPTED")) });
  if (!has) await db.insert(s.productionEvent).values({ orderId, stage: "ACCEPTED" });
}

export class ProductionError extends Error {}

/** Отметка мастера: этап, комментарий для покупателя, фото. Сразу сообщаем покупателю. */
export async function addStage(orderId: string, stage: Stage, opts: { note?: string | null; photo?: string | null; actorId: string }) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { user: true } });
  if (!o) throw new ProductionError("Заказ не найден");
  if (!["PAID", "ASSEMBLING"].includes(o.status)) throw new ProductionError("Этапы изготовления — только у оплаченного заказа до отправки");
  if (!(await isCueOrder(orderId))) throw new ProductionError("В заказе нет кия на заказ");
  const note = opts.note?.trim().slice(0, 1000) || null;
  const photo = opts.photo && /^(\/|https:\/\/)[^\s"<>]+$/.test(opts.photo) ? opts.photo : null;
  await db.insert(s.productionEvent).values({ orderId, stage, note, photo, createdById: opts.actorId });
  if (stage !== "ACCEPTED" && o.status === "PAID") await db.update(s.order).set({ status: "ASSEMBLING" }).where(eq(s.order.id, orderId));

  const link = `${SITE.url}/order/${o.number}#production`;
  // Письмо
  if (mailEnabled() && !isPlaceholderEmail(o.email)) {
    const title = stage === "READY" ? "Ваш кий готов!" : stage === "IN_WORK" ? "Мастер работает над вашим кием" : "Кий принят в работу";
    const lead =
      stage === "READY"
        ? `Кий «Чемпион» по заказу №${escHtml(o.number)} готов. Проверим его ещё раз, упакуем и отправим СДЭК — трек-номер пришлём отдельным письмом.`
        : stage === "IN_WORK"
          ? `Новости из мастерской по заказу №${escHtml(o.number)}.`
          : `Кий «Чемпион» по заказу №${escHtml(o.number)} принят в работу.`;
    const ready = stage !== "READY" ? await expectedReady(o.paidAt) : null;
    const body =
      lead +
      (note ? `<div style="margin:16px 0;padding:14px 16px;border-left:3px solid #dcbf83;background:#1a1a1d;color:#f3f2ef">${escHtml(note).replace(/\n/g, "<br>")}<div style="color:#a3a3a8;font-size:12px;margin-top:6px">— мастер</div></div>` : "") +
      (photo ? `<div style="margin:16px 0"><img src="${escHtml(abs(photo))}" alt="Фото кия" style="display:block;width:100%;max-width:536px;height:auto;border:1px solid #2a2a2a"></div>` : "") +
      (ready ? `<div style="color:#a3a3a8;font-size:13px;margin-top:8px">Ориентировочно кий будет готов к ${fmtDate(ready)}.</div>` : "");
    await sendMail(o.email, `${title} — заказ ${o.number}`, title, body, { text: "Открыть заказ", url: link }).catch((e) => console.error("[production] mail:", e?.message ?? e));
  }
  // Telegram — только номер заказа и этап (персональные данные и тексты туда не отправляем)
  if (o.user?.telegramChatId && o.user.notifyTelegram) {
    const { send, telegramEnabled } = await import("@/lib/telegram");
    if (telegramEnabled()) {
      const icon = stage === "READY" ? "🎉" : "🛠";
      await send(o.user.telegramChatId, `${icon} Заказ <b>${o.number}</b>: ${STAGE_LABEL[stage].toLowerCase()}.`, [{ text: "Открыть заказ", url: link }]).catch(() => {});
    }
  }
}
