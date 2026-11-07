import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { PinForm } from "./PinForm";

export const metadata = { title: "Мой PIN" };
export const dynamic = "force-dynamic";

/** PIN менеджера для кассы: скидка сверх лимита кассира и возврат */
export default async function MyPin() {
  const me = await requireAdmin();
  const can = me.role === "OWNER" || me.role === "MANAGER" || me.extraRoles.includes("MANAGER");
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/pos">← Касса</Link>
      </p>
      <h1>Мой PIN</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 720 }}>
        PIN из 6 цифр подтверждает в кассе то, что кассир сам сделать не может: скидку больше лимита и возврат. Вы вводите его на телефоне кассира сами — не диктуйте и
        не записывайте. Задать или сменить PIN можно только с кодом из письма. Каждый раз, когда вашим PIN что-то подтверждают, вам приходит письмо, а в нём кнопка «Это был
        не я» — она сразу блокирует PIN. После 5 неверных вводов подряд PIN блокируется сам.
      </p>
      <div className="panel stack" style={{ gap: 12 }}>
        <div>
          {me.pinLockedAt ? (
            <span className="pill pill--bad">PIN заблокирован {fmtDateTime(me.pinLockedAt)} — задайте новый</span>
          ) : me.pinHash ? (
            <span className="pill pill--ok">PIN действует{me.pinSetAt ? ` с ${fmtDateTime(me.pinSetAt)}` : ""}</span>
          ) : (
            <span className="pill">PIN не задан</span>
          )}
        </div>
        {can ? <PinForm hasPin={!!me.pinHash} /> : <p className="muted">PIN задают владелец и менеджеры.</p>}
      </div>
    </>
  );
}
