import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { countScan, EVENT_ICON, passportByCode, passportEvents, transferValid, warrantyUntil } from "@/lib/cue-passport";
import { fmtDate } from "@/lib/format";
import { sized } from "@/lib/img";
import { hasRole } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { OwnerBox } from "./OwnerBox";

export const metadata: Metadata = { title: "Паспорт кия", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Паспорт кия по QR: подлинность, модель, мастер, гарантия, история.
 * Без данных владельца — страницу видит любой, кто сканирует кий.
 */
export default async function PassportPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  const p = await passportByCode(code);
  if (!p) notFound();
  const [events, viewer] = await Promise.all([passportEvents(p.id), getViewer()]);
  const me = viewer && !viewer.isDevice ? viewer : null;
  const mine = !!me && p.ownerId === me.id;
  // Сканы владельца и сотрудников не считаем
  if (!mine && !hasRole(viewer, "OWNER") && !hasRole(viewer, "MANAGER")) await countScan(p.id);

  const active = p.status === "ACTIVE";
  const until = warrantyUntil(p);
  const warrantyOn = p.warrantyMonths > 0 && until > new Date();
  const specs = (p.spec ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["", l];
    });
  const mode = !active ? null : mine ? "owner" : t && transferValid(p, t) ? "accept" : p.ownerId ? "taken" : "claim";

  return (
    <section className="container page-pad" style={{ maxWidth: 640 }}>
      <div className={`passport${active ? "" : " passport--void"}`}>
        <div className="passport__top">
          <Logo id="passport" className="passport__logo" />
          <span className="passport__kind">Паспорт кия</span>
        </div>

        {active ? (
          <div className="passport__ok" role="status">
            <span aria-hidden>✓</span> Подлинный кий Abramov
          </div>
        ) : (
          <div className="form-error" role="status">
            Паспорт аннулирован. Если кий у вас в руках — напишите нам, разберёмся.
          </div>
        )}

        {p.photo && <img className="passport__photo" src={sized(p.photo, 640)} alt={p.model} loading="lazy" />}

        <h1 className="passport__model">{p.model}</h1>
        <div className="passport__serial">
          № <b>{p.serial}</b>
          <span className="muted small">— сверьте с номером на кие</span>
        </div>

        <dl className="passport__facts">
          {p.master && (
            <>
              <dt>Мастер</dt>
              <dd>{p.master}</dd>
            </>
          )}
          <dt>Изготовлен</dt>
          <dd>{fmtDate(p.madeAt)}</dd>
          <dt>Гарантия</dt>
          <dd>
            {p.warrantyMonths === 0 ? (
              "без гарантии"
            ) : warrantyOn ? (
              <span className="pill pill--ok">до {fmtDate(until)}</span>
            ) : (
              <span className="pill">закончилась {fmtDate(until)}</span>
            )}
          </dd>
          {specs.map(([k, v], i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt>{k || "—"}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        {events.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <h2 className="h5" style={{ margin: 0 }}>
              История кия
            </h2>
            <ol className="passport__history">
              {events.map((e) => (
                <li key={e.id}>
                  <span aria-hidden>{EVENT_ICON[e.kind] ?? "•"}</span>
                  <span>
                    {e.text}
                    <span className="muted small"> · {fmtDate(e.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {mode && (
          <OwnerBox
            mode={mode}
            code={p.code}
            passportId={p.id}
            token={mode === "accept" ? t : undefined}
            transferUntil={mine && p.transferUntil && p.transferUntil > new Date() ? fmtDate(p.transferUntil) : null}
          />
        )}

        <p className="muted small" style={{ margin: 0 }}>
          Настоящий паспорт открывается только на сайте <b>abramov.shop</b> — проверьте адрес в браузере. Обслуживание и ремонт — в мастерской Abramov.
        </p>
      </div>
    </section>
  );
}
