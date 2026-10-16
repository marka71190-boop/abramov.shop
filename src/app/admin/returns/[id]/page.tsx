import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { defaultInstructions, loadForAdmin, RETURN_KIND, RETURN_RESOLUTION, RETURN_STATUS, ReturnError } from "@/lib/returns";
import { requireAdmin } from "@/lib/viewer";
import { ReturnControls } from "./ReturnControls";
import { ConclusionForm } from "./ConclusionForm";
import { MediaGallery } from "@/components/inspection/MediaGallery";
import { MediaUploader } from "@/components/inspection/MediaUploader";
import { db, schema as s } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { driveStatus } from "@/lib/gdrive";
import { loadInspection } from "@/lib/inspection";

export default async function ReturnAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const data = await loadForAdmin(id).catch((e) => {
    if (e instanceof ReturnError) return null;
    throw e;
  });
  if (!data) notFound();
  const { r, estimate } = data;
  const [shipped, returnMedia, drive] = await Promise.all([
    loadInspection(r.orderId),
    db.query.inspectionMedia.findMany({ where: and(eq(s.inspectionMedia.returnId, r.id)), orderBy: asc(s.inspectionMedia.createdAt) }),
    driveStatus(),
  ]);
  const st = RETURN_STATUS[r.status];
  const o = r.order;
  const late = r.status === "NEW" && +r.decisionDue < Date.now();

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/returns">← Возвраты</Link>
      </p>
      <h1>
        {r.number} <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>
      </h1>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="panel stack">
            <div className="small">
              <div>
                Заказ <Link href={`/admin/orders/${o.id}`}>{o.number}</Link> от {fmtDate(o.createdAt)}, получен {o.deliveredAt ? fmtDate(o.deliveredAt) : "—"}
              </div>
              <div>
                {o.customerName} · {prettyPhone(o.phone)} · {o.email}
              </div>
              <div className="muted">
                Заявка от {fmtDateTime(r.createdAt)} ·{" "}
                <span style={{ color: late ? "var(--c-danger)" : undefined }}>
                  ответить до {fmtDate(r.decisionDue)}
                  {late ? " — просрочено" : ""}
                </span>
              </div>
            </div>
            <div>
              <div className="label">Что случилось</div>
              <div>
                {RETURN_KIND[r.kind]}
                {r.kind === "DEFECT" ? ` — хочет: ${RETURN_RESOLUTION[r.resolution].toLowerCase()}` : " — возврат денег"}
              </div>
              <div className="muted small">Причина: {r.reason}</div>
              {r.comment && <div className="rcard__answer" style={{ marginTop: 8 }}>{r.comment}</div>}
            </div>
            <div>
              <div className="label">Товары</div>
              {r.items.map((i) => (
                <div key={i.id} className="summary__row">
                  <span>
                    {i.orderItem.name} × {i.quantity}
                  </span>
                  <span>{rub(i.orderItem.price * i.quantity)}</span>
                </div>
              ))}
            </div>
            {r.photos.length > 0 && (
              <div>
                <div className="label">Фото</div>
                <div className="rphotos">
                  {r.photos.map((p) => (
                    <a key={p} href={p} target="_blank" rel="noreferrer">
                      <img src={p} alt="" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          {(r.status === "RECEIVED" || r.status === "APPROVED" || returnMedia.length > 0 || r.conclusion) && (
            <div className="panel stack">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <strong>Проверка мастером</strong>
                {r.inspectionDue && r.status === "RECEIVED" && (
                  <span className={`pill ${+r.inspectionDue < Date.now() ? "pill--bad" : "pill--warn"}`}>до {fmtDate(r.inspectionDue)}</span>
                )}
              </div>
              <div className="muted small">
                Сфотографируйте и снимите на видео, в каком виде пришёл товар: серийный номер, пломбу, недостаток. Файлы попадут в папку заказа на Google
                Диске, покупатель увидит их в кабинете.
              </div>
              <MediaGallery media={returnMedia} canDelete={["APPROVED", "RECEIVED"].includes(r.status)} />
              {drive.connected && ["APPROVED", "RECEIVED"].includes(r.status) && <MediaUploader orderId={r.orderId} returnId={r.id} />}
              {["APPROVED", "RECEIVED"].includes(r.status) ? (
                <ConclusionForm id={r.id} initial={r.conclusion ?? ""} />
              ) : (
                r.conclusion && <div className="rcard__answer">{r.conclusion}</div>
              )}
            </div>
          )}
          {(shipped.media.length > 0 || shipped.insp?.serialNumber || shipped.insp?.sealNumber) && (
            <div className="panel stack">
              <strong>Как товар уходил покупателю</strong>
              <div className="small">
                {shipped.insp?.checkedAt ? `Проверен ${fmtDateTime(shipped.insp.checkedAt)}` : "Проверка не отмечена"}
                {shipped.insp?.serialNumber ? ` · серийный номер ${shipped.insp.serialNumber}` : ""}
                {shipped.insp?.sealNumber ? ` · пломба ${shipped.insp.sealNumber}` : ""}
              </div>
              <MediaGallery media={shipped.media} />
            </div>
          )}
          <div className="panel small stack" style={{ gap: 6 }}>
            <strong>Расчёт возврата</strong>
            <div className="summary__row">
              <span>Товары по цене в заказе</span>
              <span>{rub(estimate.value)}</span>
            </div>
            <div className="summary__row">
              <span>Заплачено за них деньгами (с учётом скидки и бонусов)</span>
              <span>{rub(estimate.money)}</span>
            </div>
            {estimate.giftBack > 0 && (
              <div className="summary__row">
                <span>Оплачено сертификатом — при возврате денег вернётся на сертификат</span>
                <span>{rub(estimate.giftBack)}</span>
              </div>
            )}
            {estimate.bonusBack > 0 && (
              <div className="summary__row">
                <span>Оплачено бонусами — вернутся на счёт</span>
                <span>{num(estimate.bonusBack)}</span>
              </div>
            )}
            {estimate.accruedBack > 0 && (
              <div className="summary__row">
                <span>Начислено бонусов за эти товары — спишутся</span>
                <span>{num(estimate.accruedBack)}</span>
              </div>
            )}
            <div className="muted">
              {estimate.hasPayment ? `Остаток платежа в ЮKassa, который можно вернуть: ${rub(estimate.left)}.` : "Платёж через ЮKassa не найден — деньги вернутся только в учёте."}{" "}
              Доставку заказа к покупателю не возвращаем, если она была оказана.
            </div>
          </div>
          {r.answer && (
            <div className="panel">
              <div className="label">Ответ покупателю</div>
              <div className="rcard__answer" style={{ marginTop: 8 }}>
                {r.answer}
              </div>
            </div>
          )}
          {r.refundAmount != null && (
            <div className="panel small">
              Возвращено {rub(r.refundAmount)}
              {r.bonusReturned ? `, бонусов на счёт: ${num(r.bonusReturned)}` : ""}
              {r.restocked ? " · товар возвращён на склад" : ""}
              {r.resolvedAt ? ` · ${fmtDateTime(r.resolvedAt)}` : ""}
            </div>
          )}
        </div>
        <ReturnControls
          id={r.id}
          status={r.status}
          kind={r.kind}
          resolution={r.resolution}
          restocked={r.restocked}
          instructions={defaultInstructions(r)}
          suggested={estimate.money / 100}
          max={estimate.hasPayment ? estimate.left / 100 : null}
          hasBonuses={estimate.bonusBack > 0 || estimate.accruedBack > 0}
          canRefund={me.role === "OWNER"}
        />
      </div>
    </>
  );
}
