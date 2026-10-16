import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GiftCardView } from "@/components/gift/GiftCardView";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime, rub } from "@/lib/format";
import { isExpired, syncGiftPayment } from "@/lib/giftcards";
import { getViewer } from "@/lib/viewer";
import { CopyCode, PrintButton, WaitPayment } from "./GiftActions";

export const metadata: Metadata = { title: "Подарочный сертификат", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ from?: string }> };

const load = (token: string) => db.query.giftCard.findFirst({ where: eq(s.giftCard.token, token.slice(0, 64)) });

export default async function GiftCardPage({ params, searchParams }: Props) {
  const [{ token }, { from }] = await Promise.all([params, searchParams]);
  let card = await load(token);
  if (!card) notFound();
  if (card.status === "PENDING" && card.paymentId) {
    await syncGiftPayment(card.id);
    card = (await load(token))!;
  }
  const viewer = await getViewer();
  const isBuyer = !!viewer && viewer.id === card.buyerId;
  const expired = isExpired(card);

  if (card.status === "PENDING") {
    const canPay = card.confirmationUrl && card.payExpiresAt && card.payExpiresAt > new Date();
    return (
      <section className="container page-pad gift-page">
        {from === "pay" && <WaitPayment />}
        <h1 className="h2">Сертификат на {rub(card.initialAmount)}</h1>
        <div className="notice notice--muted">
          {from === "pay" ? "Проверяем оплату — обычно это занимает несколько секунд." : "Сертификат ждёт оплату. Как только она пройдёт, он сразу начнёт действовать."}
        </div>
        {canPay && from !== "pay" && (
          <div>
            <a className="btn btn--gold" href={card.confirmationUrl!}>
              Оплатить {rub(card.initialAmount)}
            </a>
          </div>
        )}
      </section>
    );
  }

  if (card.status === "VOID") {
    return (
      <section className="container page-pad gift-page">
        <h1 className="h2">Сертификат недействителен</h1>
        <p className="muted">
          {card.refundedAt ? "Деньги за этот сертификат возвращены покупателю." : card.paidAt ? "Сертификат аннулирован." : "Сертификат не был оплачен."} Если это ошибка —
          напишите нам, поможем.
        </p>
        <div>
          <Link className="btn btn--line" href="/gift">
            Купить сертификат
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="container page-pad gift-page gift-print">
      {from === "pay" && (
        <div className="notice no-print">Оплата прошла — сертификат действует. {card.buyerEmail ? "Ссылку на него мы отправили вам на почту." : ""}</div>
      )}
      <GiftCardView
        id="card"
        amount={card.initialAmount}
        code={card.code}
        recipientName={card.recipientName}
        senderName={card.senderName}
        message={card.message}
        expiresAt={card.expiresAt}
      />
      <div className="panel stack no-print" style={{ gap: 12 }}>
        {expired ? (
          <div className="form-error" style={{ margin: 0 }}>
            Срок действия сертификата закончился {fmtDate(card.expiresAt!)}.
          </div>
        ) : (
          <>
            <div className="summary__row" style={{ margin: 0 }}>
              <span>Доступно для оплаты</span>
              <strong className="gold">{rub(card.balance)}</strong>
            </div>
            {card.balance < card.initialAmount && <div className="muted small">Часть суммы уже потратили — остаток можно использовать в следующих заказах.</div>}
          </>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Как использовать: добавьте товары в корзину и введите код при оформлении заказа в поле «Подарочный сертификат». Если заказ дороже — доплатите картой, если
          дешевле — остаток сохранится на сертификате.
        </p>
        <div className="row">
          {!expired && card.balance > 0 && <CopyCode code={card.code} />}
          <PrintButton />
          <Link className="btn btn--line" href="/catalog">
            Выбрать подарок
          </Link>
        </div>
      </div>
      {isBuyer && card.recipientEmail && (
        <p className="muted small no-print" style={{ margin: 0 }}>
          {card.sentAt
            ? `Письмо получателю (${card.recipientEmail}) отправлено ${fmtDateTime(card.sentAt)}.`
            : card.sendAt
              ? `Письмо получателю (${card.recipientEmail}) уйдёт ${fmtDate(card.sendAt)} в 10:00 по Москве.`
              : `Отправляем письмо получателю (${card.recipientEmail}).`}
        </p>
      )}
    </section>
  );
}
