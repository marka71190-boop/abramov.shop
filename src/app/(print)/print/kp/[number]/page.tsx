import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PlanSvg } from "@/components/turnkey/PlanSvg";
import { db, schema as s } from "@/db";
import { fmtDate, prettyPhone, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { SELLER, SITE } from "@/lib/site";
import { getTurnkey } from "@/lib/turnkey";
import type { EstimateLine } from "@/lib/turnkey-config";
import { TABLE_KINDS, type Placed, type Plan, type TableModel } from "@/lib/turnkey-geom";
import { getViewer, isAdmin } from "@/lib/viewer";
import { InvoiceBar } from "../../invoice/[number]/InvoiceBar";

export const metadata: Metadata = { title: "Коммерческое предложение", robots: { index: false } };

/** КП «Клуб под ключ»: план зала, столы, смета — печать или PDF */
export default async function KpPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ auto?: string }> }) {
  const [{ number }, { auto }] = await Promise.all([params, searchParams]);
  const me = await getViewer();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/print/kp/${number}`)}`);
  const r = await db.query.turnkeyRequest.findFirst({ where: eq(s.turnkeyRequest.number, number) });
  if (!r || (r.userId !== me.id && !isAdmin(me))) notFound();
  const [cfg, settings] = await Promise.all([getTurnkey(), getSettings()]);
  const plan = r.plan as Plan;
  const tables = r.tables as Placed[];
  const models = r.models as TableModel[];
  const lines = r.estimate as EstimateLine[];
  const partial = lines.some((l) => l.onRequest);
  const until = new Date(r.createdAt.getTime() + cfg.validDays * 86400_000);
  const used = models.filter((m) => tables.some((t) => t.modelId === m.id));

  return (
    <>
      <InvoiceBar auto={auto === "1"} />
      <div className="sheet kp">
        <div className="sheet__head">
          <header className="insert__head" style={{ border: 0, padding: 0 }}>
            <Logo id="kp" />
            <div>
              <div className="insert__brand">ABRAMOV SHOP</div>
              <div className="sheet__muted">{SITE.url.replace(/^https?:\/\//, "")}</div>
            </div>
          </header>
          <div style={{ textAlign: "right" }}>
            <div className="sheet__label">Коммерческое предложение</div>
            <div className="sheet__number" style={{ fontSize: 26 }}>
              {r.number}
            </div>
            <div className="sheet__muted">от {fmtDate(r.createdAt)} · действует до {fmtDate(until)}</div>
          </div>
        </div>
        <h1 className="kp__title">Бильярдный клуб под ключ</h1>
        <p className="kp__lead">
          Для: <b>{r.name}</b>
          {r.city ? `, ${r.city}` : ""}. Зал {(r.area / 100).toLocaleString("ru-RU")} м², высота потолка {(plan.ceiling / 1000).toLocaleString("ru-RU")} м, столов — {r.tableCount}.
          {r.budget ? ` Бюджет: ${r.budget.toLocaleString("ru-RU")} ₽.` : ""}
        </p>
        <div className="kp__plan">
          <PlanSvg plan={plan} tables={tables} models={models} print />
        </div>
        <div className="kp__legend">
          {used.map((m) => (
            <span key={m.id}>
              <i style={{ background: m.cloth, borderColor: m.frame }} />
              {m.name} — {tables.filter((t) => t.modelId === m.id).length} шт. · {(m.length / 1000).toLocaleString("ru-RU")} × {(m.width / 1000).toLocaleString("ru-RU")} м
              {TABLE_KINDS[m.kind] ? `, поле ${TABLE_KINDS[m.kind].field}` : ""}
            </span>
          ))}
          <span className="sheet__muted">
            Отступы: от борта до стены — {(cfg.gaps.wall / 1000).toLocaleString("ru-RU")} м, между столами — {(r.tableGap / 1000).toLocaleString("ru-RU")} м.
          </span>
        </div>
        <table className="kp__est">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Кол-во</th>
              <th>Цена</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.name}>
                <td>{l.name}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.onRequest ? "по запросу" : rub(l.price)}</td>
                <td className="num">{l.onRequest ? "—" : rub(l.sum)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <b>Итого{partial && r.total ? " (без позиций по запросу)" : ""}</b>
              </td>
              <td className="num">
                <b>{r.total ? rub(r.total) : "по запросу"}</b>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="sheet__muted" style={{ margin: 0 }}>
          {cfg.note}
        </p>
        <div className="kp__foot">
          <div>
            <b>{SELLER.name}</b>
            <br />
            ИНН {SELLER.inn} · {SELLER.actualAddress}
          </div>
          <div style={{ textAlign: "right" }}>
            {SITE.url.replace(/^https?:\/\//, "")}
            <br />
            {settings.supportEmail}
            {settings.supportTelegram ? ` · Telegram @${settings.supportTelegram}` : ""}
          </div>
        </div>
        <div className="sheet__muted" style={{ fontSize: 10 }}>
          Контакт для связи: {r.name}, {prettyPhone(r.phone)}, {r.email}
        </div>
      </div>
    </>
  );
}
