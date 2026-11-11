import Link from "next/link";
import { listPassports, warrantyUntil } from "@/lib/cue-passport";
import { fmtDate, num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Паспорта киёв: список, поиск по номеру и модели */
export default async function PassportsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const rows = await listPassports(q);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Паспорта киёв</h1>
        <Link className="btn btn--gold btn--sm" href="/admin/passports/new">
          Выпустить паспорт
        </Link>
      </div>
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
