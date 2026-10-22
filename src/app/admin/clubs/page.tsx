import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

export default async function ClubsAdmin() {
  await requireAdmin("OWNER");
  const [clubs, settings] = await Promise.all([db.query.club.findMany({ orderBy: [asc(s.club.city), asc(s.club.sortOrder)] }), getSettings()]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Клубы</h1>
        <Link href="/admin/clubs/new" className="btn btn--gold">
          Добавить клуб
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Клубы сети: самовывоз заказов (бесплатно, заказ ждёт {settings.delivery.pickupStorageDays} дн.) и приём киёв в мастерскую. Самовывоз{" "}
        {settings.delivery.pickupEnabled ? "включён" : "выключен"} — <Link href="/admin/settings">Настройки</Link>.
      </p>
      {clubs.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Клуб</th>
                <th>Адрес</th>
                <th>Самовывоз</th>
                <th>Мастерская</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                  <td>
                    <Link href={`/admin/clubs/${c.id}`}>{c.name}</Link>
                    {!c.isActive && <div className="muted small">выключен</div>}
                  </td>
                  <td className="small">
                    {c.city}, {c.address}
                    {c.workTime && <div className="muted">{c.workTime}</div>}
                  </td>
                  <td>{c.pickup ? "да" : "—"}</td>
                  <td>{c.service ? "да" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Клубов пока нет — добавьте первый.</p>
      )}
    </>
  );
}
