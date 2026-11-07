import type { Metadata } from "next";
import Link from "next/link";
import { DecideForm } from "@/app/pin/approve/[token]/DecideForm";
import { ApprovalCard } from "@/components/pos/ApprovalCard";
import { PushToggle } from "@/components/pwa/PushToggle";
import { pushPublicKey } from "@/lib/push";
import { pendingApprovals } from "@/lib/pos-approval";
import { rolesOf } from "@/lib/roles";
import { requireAdmin } from "@/lib/viewer";
import { decideByIdAction } from "./actions";
import { AutoRefresh } from "./AutoRefresh";

export const metadata: Metadata = { title: "Ждут подтверждения" };
export const dynamic = "force-dynamic";

const left = (d: Date) => {
  const s = Math.max(0, Math.round((+d - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default async function ApprovalsPage() {
  const me = await requireAdmin("MANAGER");
  const owner = rolesOf(me).includes("OWNER");
  const rows = await pendingApprovals(me.id, owner);
  const mine = rows.filter((r) => r.mine);
  const others = rows.filter((r) => !r.mine);

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
      <AutoRefresh />
      <div>
        <Link href="/admin/pos" className="muted small">
          ← Касса
        </Link>
        <h1 className="h2" style={{ margin: "6px 0 4px" }}>
          Ждут подтверждения
        </h1>
        <p className="muted small" style={{ margin: 0 }}>
          Сюда попадают запросы кассы на скидку сверх лимита и возврат — те же, что приходят письмом. Подтверждайте своим PIN.
        </p>
      </div>

      {!me.pinHash && (
        <div className="notice">
          У вас не задан PIN — кассы не смогут выбрать вас для подтверждения. <Link href="/admin/pos/pin">Задать PIN</Link>
        </div>
      )}

      {pushPublicKey() && (
        <div className="panel row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span className="small">Уведомление на телефон приходит быстрее письма — включите на телефоне, с которого подтверждаете.</span>
          <PushToggle publicKey={pushPublicKey()} signedIn what="запросы из кассы, заказы и заявки" />
        </div>
      )}

      {mine.length === 0 ? (
        <div className="notice notice--muted">Сейчас вам подтверждать нечего. Страница обновляется сама.</div>
      ) : (
        mine.map((r) => (
          <section key={r.id} className="panel stack" style={{ gap: 14, borderColor: "var(--c-gold)" }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span className="pill">{r.kind === "RETURN" ? "Возврат" : "Скидка"}</span>
              <span className="muted small">ещё {left(r.expiresAt)}</span>
            </div>
            <ApprovalCard kind={r.kind} summary={r.summary} details={r.details} />
            <DecideForm action={decideByIdAction.bind(null, r.id)} autoFocus={mine.length === 1} />
          </section>
        ))
      )}

      {others.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            Ждут других менеджеров
          </h2>
          {others.map((r) => (
            <div key={r.id} className="panel stack" style={{ gap: 8 }}>
              <div className="muted small">
                Подтверждает: {r.approverName} · ещё {left(r.expiresAt)}
              </div>
              <ApprovalCard kind={r.kind} summary={r.summary} details={r.details} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
