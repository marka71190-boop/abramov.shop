import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanSvg } from "@/components/turnkey/PlanSvg";
import { db, schema as s } from "@/db";
import { fmtDateTime, prettyPhone, rub } from "@/lib/format";
import type { EstimateLine } from "@/lib/turnkey-config";
import type { Placed, Plan, TableModel } from "@/lib/turnkey-geom";
import { requireAdmin } from "@/lib/viewer";
import { RequestControls } from "./RequestControls";

export default async function TurnkeyRequestAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await db.query.turnkeyRequest.findFirst({ where: eq(s.turnkeyRequest.id, id) });
  if (!r) notFound();
  const lines = r.estimate as EstimateLine[];
  const models = r.models as TableModel[];
  const tables = r.tables as Placed[];
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/turnkey">← Клуб под ключ</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{r.number}</h1>
        <a className="btn btn--line btn--sm" href={`/print/kp/${r.number}`} target="_blank" rel="noreferrer">
          КП для печати
        </a>
      </div>
      <div className="grid-2">
        <div className="panel stack" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 4 }}>Клиент</h2>
          <div>
            {r.name}
            {r.city ? `, ${r.city}` : ""}
          </div>
          <div>
            <a href={`tel:${r.phone}`}>{prettyPhone(r.phone)}</a> · <a href={`mailto:${r.email}`}>{r.email}</a>
          </div>
          {r.userId && (
            <div className="small">
              <Link href={`/admin/customers/${r.userId}`}>Карточка клиента</Link>
            </div>
          )}
          {r.comment && <div className="notice notice--muted" style={{ margin: 0, whiteSpace: "pre-line", textAlign: "left" }}>{r.comment}</div>}
          <div className="muted small">Заявка {fmtDateTime(r.createdAt)}</div>
        </div>
        <div className="panel stack" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 4 }}>Смета на момент заявки</h2>
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
            <b>{rub(r.total)}</b>
          </div>
        </div>
      </div>
      <div className="panel">
        <PlanSvg plan={r.plan as Plan} tables={tables} models={models} />
        <div className="small muted" style={{ marginTop: 8 }}>
          Зал {(r.area / 100).toLocaleString("ru-RU")} м² · потолок {((r.plan as Plan).ceiling / 1000).toLocaleString("ru-RU")} м ·{" "}
          {models.map((m) => `${m.name}: ${tables.filter((t) => t.modelId === m.id).length}`).join(", ")}
        </div>
      </div>
      <RequestControls id={r.id} status={r.status} note={r.adminNote ?? ""} />
    </>
  );
}
