"use client";
import { useEffect, useState } from "react";
import { PushToggle } from "./PushToggle";
import { currentSubscription, isIos, isStandalone, pushSupported } from "./pwa";

/** На странице заказа: «Сообщить, когда заказ отправят?» — только если уведомления ещё не включены */
export function OrderPushHint({ publicKey, pickup }: { publicKey: string | null; pickup: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem("ab_order_push_hide")) return;
      } catch {}
      if (!publicKey) return;
      if (!pushSupported()) return setShow(isIos() && !isStandalone());
      if (Notification.permission === "denied") return;
      const sub = await currentSubscription().catch(() => null);
      setShow(!sub || Notification.permission !== "granted");
    })();
  }, [publicKey]);
  if (!show) return null;
  return (
    <div className="panel stack order-push" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <b>{pickup ? "Сообщить, когда заказ будет в клубе?" : "Прислать трек-номер уведомлением?"}</b>
          <div className="small muted">Уведомление придёт на этот телефон или компьютер — даже если сайт закрыт.</div>
        </div>
        <button
          type="button"
          className="linklike small"
          onClick={() => {
            try {
              localStorage.setItem("ab_order_push_hide", "1");
            } catch {}
            setShow(false);
          }}
        >
          Не надо
        </button>
      </div>
      <PushToggle publicKey={publicKey} signedIn what="статус этого и следующих заказов" />
    </div>
  );
}
