import { IconLock, IconTelegram } from "@/components/Icons";
import { SignOutButton } from "@/components/SignOutButton";
import { fmtDate } from "@/lib/format";

interface Props {
  reason: string;
  until: Date | null;
  ticket: string | null;
  telegram: string;
}

/** Окно блокировки: показывается поверх сайта сразу после входа забаненного клиента. */
export function BanModal({ reason, until, ticket, telegram }: Props) {
  return (
    <div className="ban" role="dialog" aria-modal="true" aria-labelledby="ban-title">
      <div className="ban__card">
        <div className="stripe" aria-hidden />
        <div className="ban__icon">
          <IconLock size={34} />
        </div>
        <div>
          <h1 id="ban-title">Аккаунт заблокирован</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
            Покупки и бонусы временно недоступны
          </p>
        </div>
        <div className="ban__details">
          <div>
            <div className="label label--gold">Причина</div>
            <div style={{ marginTop: 4, fontSize: 15, whiteSpace: "pre-line" }}>{reason}</div>
          </div>
          <div className="ban__meta">
            <div>
              <div className="label">Срок</div>
              <div style={{ marginTop: 2, fontSize: 15 }}>{until ? `до ${fmtDate(until)}` : "бессрочно"}</div>
            </div>
            {ticket && (
              <div>
                <div className="label">Номер обращения</div>
                <div style={{ marginTop: 2, fontSize: 15 }}>{ticket}</div>
              </div>
            )}
          </div>
        </div>
        <p className="muted small">
          Считаете, что это ошибка? Напишите в поддержку{ticket ? " и назовите номер обращения" : ""} — разберёмся.
        </p>
        <a className="btn btn--gold btn--block" href={`https://t.me/${telegram}`} target="_blank" rel="noopener noreferrer">
          <IconTelegram size={20} />
          Написать @{telegram}
        </a>
        <SignOutButton className="linklike">Выйти из аккаунта</SignOutButton>
      </div>
    </div>
  );
}
