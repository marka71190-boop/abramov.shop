/**
 * POST /api/payments/yookassa — уведомления ЮKassa.
 * В личном кабинете ЮKassa: Интеграция → HTTP-уведомления → этот адрес,
 * события payment.succeeded и payment.canceled.
 *
 * Уведомлению на слово не верим: статус платежа всегда перепроверяем запросом к API ЮKassa.
 */
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { applyGiftPayment } from "@/lib/giftcards";
import { applyPayment } from "@/lib/orders";
import { getPayment, yookassaEnabled } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!yookassaEnabled()) return Response.json({ ok: false }, { status: 404 });
  let body: { type?: string; event?: string; object?: { id?: string } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const id = body?.object?.id;
  if (body?.type !== "notification" || !id || !body.event?.startsWith("payment.")) return Response.json({ ok: true, skipped: true });
  try {
    // Чужие и выдуманные номера платежей не проверяем — сразу отвечаем «принято»
    const known = await db.query.payment.findFirst({ where: eq(s.payment.externalId, String(id).slice(0, 64)), columns: { id: true } });
    if (!known) {
      const gift = await db.query.giftCard.findFirst({ where: eq(s.giftCard.paymentId, String(id).slice(0, 64)), columns: { id: true } });
      if (!gift) {
        // Оплата заявки в мастерскую
        const { applyServicePayment, findServiceByPayment } = await import("@/lib/service");
        if (!(await findServiceByPayment(String(id).slice(0, 64)))) return Response.json({ ok: true, skipped: true });
        await applyServicePayment(await getPayment(id));
        return Response.json({ ok: true });
      }
      await applyGiftPayment(await getPayment(id));
      return Response.json({ ok: true });
    }
    await applyPayment(await getPayment(id), `webhook:${body.event}`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[yookassa] уведомление:", e);
    return Response.json({ ok: false }, { status: 500 }); // ЮKassa повторит позже
  }
}
