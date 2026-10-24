import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanSvg } from "@/components/turnkey/PlanSvg";
import { db, schema as s } from "@/db";
import { fmtDate, rub } from "@/lib/format";
import { getTurnkey } from "@/lib/turnkey";
import type { EstimateLine } from "@/lib/turnkey-config";
import type { Placed, Plan, TableModel } from "@/lib/turnkey-geom";
import { isAdmin, requireUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Клуб под ключ — ваш проект", robots: { index: false } };

export default async function TurnkeyRequestPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const me = await requireUser(`/klub-pod-klyuch/${number}`);
  const r = await db.query.turnkeyRequest.findFirst({ where: eq(s.turnkeyRequest.number, number) });
  if (!r || (r.userId !== me.id && !isAdmin(me))) notFound();
  const cfg = await getTurnkey();
  const lines = r.estimate as EstimateLine[];
  const until = new Date(r.createdAt.getTime() + cfg.validDays * 86400_000);
  return (
    <section className="container page-pad stack ym-hide-content" style={{ gap: 24 }}>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/klub-pod-klyuch">← Конструктор клуба</Link>
      </p>
      <div className="order-head">
        <div>
          <div className="label">Проект от {fmtDate(r.createdAt)}</div>
          <h1 className="h2">{r.number}</h1>
        </div>
        <a href={`/print/kp/${r.number}?auto=1`} target="_blank" rel="noreferrer" className="btn btn--gold">
          Скачать КП (PDF)
        </a>
      </div>
      <div className="notice notice--muted" style={{ margin: 0 }}>
        Заявка у менеджера — он свяжется с вами, уточнит детали и договорится о замере. Предложение действует до {fmtDate(until)}.
      </div>
      <div className="grid-2 turnkey-result">
        <div className="panel">
          <PlanSvg plan={r.plan as Plan} tables={r.tables as Placed[]} models={r.models as TableModel[]} />
          <div className="small muted" style={{ marginTop: 8 }}>
            Зал {(r.area / 100).toLocaleString("ru-RU")} м² · столов: {r.tableCount} · между столами {(r.tableGap / 1000).toLocaleString("ru-RU")} м
            {r.budget ? ` · ваш бюджет ${r.budget.toLocaleString("ru-RU")} ₽` : ""}
          </div>
        </div>
        <div className="panel stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>Смета</h2>
          {lines.map((l) => (
            <div key={l.name} className="row-line small">
              <span>
                {l.name}
                {l.qty > 1 ? ` × ${l.qty}` : ""}
              </span>
              <b>{l.onRequest ? "по запросу" : rub(l.sum)}</b>
            </div>
          ))}
          <div className="row-line">
            <span>Итого</span>
            <b className="gold">{r.total ? rub(r.total) : "рассчитает менеджер"}</b>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {cfg.note}
          </p>
        </div>
      </div>
    </section>
  );
}
