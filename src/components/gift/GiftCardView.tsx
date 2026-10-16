import { Logo } from "@/components/Logo";
import { fmtDate, rub } from "@/lib/format";

interface Props {
  id: string; // для svg-градиентов логотипа
  amount: number; // копейки
  code?: string | null; // без кода — превью при покупке
  recipientName?: string | null;
  senderName?: string | null;
  message?: string | null;
  expiresAt?: Date | string | null;
  validityDays?: number; // для превью: «действует N дней с оплаты»
}

/** Сертификат: одна вёрстка для превью при покупке, страницы сертификата и печати. */
export function GiftCardView({ id, amount, code, recipientName, senderName, message, expiresAt, validityDays }: Props) {
  return (
    <div className="giftcard">
      <div className="stripe stripe--gold" aria-hidden />
      <div className="stripe stripe--silver" aria-hidden />
      <div className="giftcard__top">
        <Logo id={`gc-${id}`} className="giftcard__logo" />
        <span className="giftcard__kind">Подарочный сертификат</span>
      </div>
      <div className="giftcard__amount">{rub(amount)}</div>
      {(recipientName || senderName) && (
        <div className="giftcard__who">
          {recipientName && (
            <div>
              <span className="label">Для</span> {recipientName}
            </div>
          )}
          {senderName && (
            <div>
              <span className="label">От</span> {senderName}
            </div>
          )}
        </div>
      )}
      {message && <p className="giftcard__msg">{message}</p>}
      <div className="giftcard__bottom">
        <div>
          <div className="label">Код</div>
          <div className="giftcard__code">{code ?? "XXXX-XXXX-XXXX"}</div>
        </div>
        <div className="giftcard__valid">
          {expiresAt ? `до ${fmtDate(expiresAt)}` : validityDays ? `${validityDays} дней с покупки` : "бессрочно"}
          <br />
          <span>abramov.shop</span>
        </div>
      </div>
    </div>
  );
}
