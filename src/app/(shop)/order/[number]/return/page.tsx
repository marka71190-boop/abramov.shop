import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDate } from "@/lib/format";
import { DECISION_DAYS, DEFECT_REASONS, QUALITY_DAYS, QUALITY_REASONS, returnable } from "@/lib/returns";
import { requireUser } from "@/lib/viewer";
import { ReturnForm } from "./ReturnForm";

export const metadata: Metadata = { title: "Возврат или обмен", robots: { index: false } };

export default async function ReturnPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await requireUser(`/order/${number}/return`);
  const o = await db.query.order.findFirst({ where: eq(s.order.number, number) });
  if (!o || o.userId !== user.id) notFound();
  const info = await returnable(o.id);
  if (!info) notFound();
  const images = await db.query.orderItem.findMany({
    where: eq(s.orderItem.orderId, o.id),
    with: { product: { columns: { slug: true }, with: { images: { limit: 1, orderBy: asc(s.productImage.sortOrder) } } } },
  });

  return (
    <section className="container page-pad" style={{ maxWidth: 820 }}>
      <p className="small" style={{ margin: "0 0 16px" }}>
        <Link href={`/order/${o.number}`}>← Заказ {o.number}</Link>
      </p>
      <h1 className="h2">Возврат или обмен</h1>
      {!info.allowed ? (
        <p className="muted">
          {o.status !== "DELIVERED"
            ? "Заявку можно оформить после получения заказа. Если хотите отказаться от заказа до получения — отмените его на странице заказа или напишите в поддержку."
            : "По этому заказу все товары уже в заявках."}
        </p>
      ) : (
        <>
          <p className="muted">
            Рассмотрим заявку в течение {DECISION_DAYS} дней и напишем решение на почту{user.telegramChatId ? " и в Telegram" : ""}. Деньги
            возвращаем в течение 10 дней. Подробно — в <Link href="/p/returns">правилах возврата</Link>.
          </p>
          <ReturnForm
            orderNumber={o.number}
            items={info.items.map((i) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              available: i.available,
              image: images.find((x) => x.id === i.id)?.product?.images[0]?.url ?? null,
            }))}
            qualityAllowed={info.qualityAllowed}
            qualityNote={
              info.qualityUntil
                ? info.qualityAllowed
                  ? `можно до ${fmtDate(info.qualityUntil)}`
                  : `срок ${QUALITY_DAYS} дней после получения истёк ${fmtDate(info.qualityUntil)}`
                : ""
            }
            qualityReasons={QUALITY_REASONS}
            defectReasons={DEFECT_REASONS}
          />
        </>
      )}
    </section>
  );
}
