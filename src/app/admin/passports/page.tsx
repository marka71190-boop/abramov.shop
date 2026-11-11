import Link from "next/link";
import { listPassports, warrantyUntil } from "@/lib/cue-passport";
import { fmtDate, num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Паспорта киёв: список, поиск по номеру и модели */
export default async function PassportsPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string }> }) {
  await requireAdmin();
  const { q = "", new: fresh = "" } = await searchParams;
  const rows = await listPassports(q);
  // Только что зарегистрировали несколько киёв — печать всех разом
  const batch = fresh.split(",").filter((x) => /^[\w-]{8,64}$/.test(x)).slice(0, 50);
  const batchRows = rows.filter((r) => batch.includes(r.id));
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Паспорта киёв</h1>
        <Link className="btn btn--gold btn--sm" href="/admin/passports/new">
          Зарегистрировать кий
        </Link>
      </div>
      {batchRows.length > 0 && (
        <div className="form-ok stack" style={{ gap: 8 }}>
          <div>
            Зарегистрировано киёв: {batchRows.length}. Номера: {batchRows.map((r) => r.serial).sort().join(", ")}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <a className="btn btn--gold btn--sm" href={`/print/passport/${batch.join(",")}?f=card`} target="_blank" rel="noreferrer">
              Печать всех карточек
            </a>
            <a className="btn btn--line btn--sm" href={`/print/passport/${batch.join(",")}?f=sticker`} target="_blank" rel="noreferrer">
              Печать всех наклеек с QR
            </a>
          </div>
        </div>
      )}
      <p className="muted" style={{ maxWidth: 760, margin: 0 }}>
        У каждого кия — номер (гравируется на кие) и QR-наклейка. Скан открывает паспорт на сайте: «Подлинный кий Abramov», модель, мастер,
        гарантия и история обслуживания. В коробку — карточка с кодом владельца: им покупатель привязывает кий к себе. Паспорт можно выпустить из
        заказа (кнопка у кия в заказе) или здесь — для продаж в клубе и старых киёв.
      </p>
      <form className="row" style={{ gap: 8 }}>
        <input className="input" name="q" defaultValue={q} placeholder="Номер AB-26-… или модель" style={{ maxWidth: 320 }} />
        <button className="btn btn--line btn--sm">Найти</button>
      </form>
      {rows.length === 0 ? (
        <div className="notice notice--muted">{q ? "Ничего не нашли" : "Паспортов пока нет — выпустите первый."}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Модель</th>
                <th>Изготовлен</th>
                <th>Гарантия до</th>
                <th>Владелец</th>
                <th>Проверок</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/passports/${p.id}`}>
                      <b>{p.serial}</b>
                    </Link>
                    {p.status === "VOID" && <span className="pill pill--bad" style={{ marginLeft: 6 }}>аннулирован</span>}
                  </td>
                  <td>{p.model}</td>
                  <td>{fmtDate(p.madeAt)}</td>
                  <td>{p.warrantyMonths ? fmtDate(warrantyUntil(p)) : "—"}</td>
                  <td>{p.ownerId ? <span className="pill pill--ok">есть</span> : <span className="muted small">не привязан</span>}</td>
                  <td>{num(p.scans)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
