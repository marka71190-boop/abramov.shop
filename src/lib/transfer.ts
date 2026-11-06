/**
 * Заказы из-за рубежа с оплатой переводом на карту.
 * Страна из списка СДЭК — сумма известна сразу, реквизиты в письме и на странице заказа.
 * Страна не из списка — менеджер считает доставку, вписывает её в заказ, и только тогда покупатель платит.
 * Оплату («Перевод получен») отмечает менеджер в админке.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { foreignFeeOf } from "@/lib/countries";
import { fmtDate, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";

export class TransferError extends Error {}

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Реквизиты для письма: переносы строк → <br> */
const detailsHtml = (text: string) => esc(text.trim()).replace(/\r?\n/g, "<br>");

async function mailPayInfo(orderId: string, kind: "created" | "priced") {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o) return;
  const f = (await getSettings()).foreign;
  const until = o.expiresAt ? fmtDate(o.expiresAt) : null;
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  if (!mailEnabled()) return;
  const url = `${SITE.url}/order/${o.number}`;
  if (o.shippingPending) {
    await sendMail(
      o.email,
      `Заказ ${o.number} принят — считаем доставку`,
      "Считаем доставку",
      `Заказ <b>${o.number}</b> принят, товар зарезервирован. Мы посчитаем стоимость доставки в вашу страну и пришлём письмо с итоговой суммой и реквизитами для перевода.<br><br>Платить пока ничего не нужно.`,
      { text: "Открыть заказ", url },
    ).catch((e) => console.error("[transfer] письмо:", e));
    return;
  }
  if (o.paymentMethod === "ROBOKASSA") {
    // Доставку посчитали — платить через Робокассу
    if (kind !== "priced") return;
    await sendMail(
      o.email,
      `Доставка посчитана — к оплате ${rub(o.total)}, заказ ${o.number}`,
      "Доставка посчитана",
      `Посчитали доставку заказа <b>${o.number}</b>: ${rub(o.shippingCost)}.<br><br>К оплате: <b>${rub(o.total)}</b>${o.foreignFee ? ` (включая сбор за международный заказ ${o.foreignPercent} % — ${rub(o.foreignFee)})` : ""}.` +
        (until ? `<br><br><span style="color:#a3a3a8">Заказ ждёт оплату до ${until}.</span>` : ""),
      { text: "Оплатить", url: `${SITE.url}/pay/robokassa/${o.number}` },
    ).catch((e) => console.error("[transfer] письмо:", e));
    return;
  }
  await sendMail(
    o.email,
    kind === "priced" ? `Доставка посчитана — к оплате ${rub(o.total)}, заказ ${o.number}` : `Оплата заказа ${o.number} переводом`,
    kind === "priced" ? "Доставка посчитана" : "Оплата переводом",
    (kind === "priced" ? `Посчитали доставку заказа <b>${o.number}</b>: ${rub(o.shippingCost)}.<br>` : `Заказ <b>${o.number}</b> принят и зарезервирован${until ? ` до ${until}` : ""}.<br>`) +
      `<br>К оплате: <b>${rub(o.total)}</b>${o.foreignFee ? ` (включая сбор за международный заказ ${o.foreignPercent} % — ${rub(o.foreignFee)})` : ""}.<br><br>` +
      `<b>Куда перевести:</b><br>${detailsHtml(f.transferDetails)}<br><br>` +
      `В комментарии к переводу укажите номер заказа <b>${o.number}</b>. Как только деньги придут, начнём собирать заказ.` +
      (until ? `<br><br><span style="color:#a3a3a8">Если перевод не поступит до ${until}, резерв снимется автоматически.</span>` : ""),
    { text: "Открыть заказ", url },
  ).catch((e) => console.error("[transfer] письмо:", e));
}

/** Новый заказ с оплатой переводом: письмо покупателю, сообщение сотрудникам (без личных данных) */
export async function transferCreated(orderId: string) {
  await mailPayInfo(orderId, "created");
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o) return;
  const { notifyAdmins } = await import("@/lib/telegram");
  const { countryText } = await import("@/lib/foreign");
  const country = await countryText(o.country, o.countryName);
  await notifyAdmins(
    o.shippingPending
      ? `🌍 <b>Заказ ${o.number} из-за рубежа</b> — ${esc(country)}${o.city ? `, ${esc(o.city)}` : ""}\nТовары ${rub(o.total - o.foreignFee)}. <b>Посчитайте доставку</b> и впишите её в заказ — покупателю уйдут сумма и реквизиты.`
      : `🌍 <b>Заказ ${o.number} из-за рубежа</b> — ${esc(country)}${o.city ? `, ${esc(o.city)}` : ""}\nОплата переводом на карту: ${rub(o.total)}. Когда деньги придут — отметьте в админке.`,
    { text: "Открыть в админке", url: `${SITE.url}/admin/orders/${o.id}` },
  );
}

/**
 * Менеджер вписал стоимость доставки (копейки): пересчитываем сбор и итог, продлеваем срок оплаты,
 * отправляем покупателю сумму и реквизиты. Можно поправить, пока заказ не оплачен.
 */
export async function setForeignShipping(orderId: string, cost: number, carrierCost: number | null) {
  const f = (await getSettings()).foreign;
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o || o.country === "RU" || (o.paymentMethod !== "TRANSFER" && o.paymentMethod !== "ROBOKASSA")) throw new TransferError("Это не заказ из-за рубежа");
  if (o.paymentMethod === "TRANSFER" && !f.transferDetails.trim()) throw new TransferError("Сначала впишите реквизиты для перевода: Настройки → Заказы из-за рубежа");
  if (o.status !== "AWAITING_PAYMENT") throw new TransferError("Заказ уже оплачен или отменён");
  const goods = o.total - o.shippingCost - o.foreignFee;
  const fee = foreignFeeOf(goods + cost, o.foreignPercent);
  const expiresAt = new Date(Date.now() + Math.max(1, f.paymentDays) * 86400_000); // и для Робокассы — дни, а не минуты
  const [row] = await db
    .update(s.order)
    .set({ shippingCost: cost, deliveryCost: carrierCost ?? cost, foreignFee: fee, total: goods + cost + fee, shippingPending: false, expiresAt })
    .where(and(eq(s.order.id, orderId), eq(s.order.status, "AWAITING_PAYMENT")))
    .returning();
  if (!row) throw new TransferError("Заказ уже оплачен или отменён");
  void mailPayInfo(orderId, "priced");
  return row;
}

/** Повторить письмо с реквизитами (покупатель потерял) */
export async function resendTransferInfo(orderId: string) {
  await mailPayInfo(orderId, "created");
}
