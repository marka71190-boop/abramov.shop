import type { Metadata } from "next";
import { rub } from "@/lib/format";
import { approvalByToken } from "@/lib/pos-approval";
import { DecideForm } from "./DecideForm";

export const metadata: Metadata = { title: "Подтверждение в кассе", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Ссылка из письма менеджеру: что просит касса, ввести PIN и подтвердить или отклонить */
export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await approvalByToken(token);
  const d = r?.details;
  return (
    <main className="kassa-login">
      <div className="kassa-login__box stack" style={{ gap: 16 }}>
        <h1 className="h3" style={{ margin: 0 }}>
          {r?.kind === "RETURN" ? "Подтвердите возврат" : "Подтвердите скидку"}
        </h1>
        {!r || !d ? (
          <p className="muted">Ссылка недействительна.</p>
        ) : (
          <>
            <div className="panel stack" style={{ gap: 8 }}>
              <b>{r.summary}</b>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {d.lines.map((l, i) => (
                  <li key={i}>
                    {l.name} × {l.qty} — {rub(l.amount)}
                  </li>
                ))}
              </ul>
              {r.kind === "DISCOUNT" && (
                <div className="small">
                  Скидка {rub(d.discount ?? 0)} ({d.percent} %), к оплате {rub(d.total)}
                </div>
              )}
              <div className="muted small">
                Касса: {d.kassa}
                {d.staffName ? ` · на смене ${d.staffName}` : ""}
                {d.place && !d.kassa.includes(d.place) ? ` · ${d.place}` : ""}
              </div>
            </div>
            {r.pinLocked ? (
              <div className="form-error">Ваш PIN заблокирован — задайте новый в админке: «Касса» → «Мой PIN».</div>
            ) : r.status !== "PENDING" ? (
              <div className="notice notice--muted">
                {r.status === "APPROVED" || r.status === "USED" ? "Уже подтверждено." : r.status === "DENIED" ? "Уже отклонено." : "Кассир отменил запрос."}
              </div>
            ) : r.expired ? (
              <div className="notice notice--muted">Время вышло — касса может запросить подтверждение снова.</div>
            ) : (
              <DecideForm token={token} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
