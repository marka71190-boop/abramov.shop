import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

export default async function ClubsAdmin() {
  await requireAdmin("OWNER");
  const [clubs, settings, staff] = await Promise.all([
    db.query.club.findMany({ orderBy: [asc(s.club.city), asc(s.club.sortOrder)] }),
    getSettings(),
    db.query.user.findMany({ where: eq(s.user.role, "CLUB"), columns: { id: true, name: true, clubId: true, telegramChatId: true } }),
  ]);
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
      <p className="muted small" style={{ margin: 0 }}>
        Администраторы клубов получают уведомления только по своему клубу и работают в разделе <Link href="/club">«Выдача в клубах»</Link>. Чтобы
        добавить: сотрудник регистрируется на сайте, затем в Клиенты → его карточка → Роль «Администратор клуба» и клуб.
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
                <th>Администраторы</th>
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
                  <td className="small">
                    {staff
                      .filter((u) => u.clubId === c.id)
                      .map((u) => (
                        <div key={u.id}>
                          <Link href={`/admin/customers/${u.id}`}>{u.name}</Link>{" "}
                          <span className="muted">{u.telegramChatId ? "· Telegram ✓" : "· уведомления на почту"}</span>
                        </div>
                      ))}
                    {!staff.some((u) => u.clubId === c.id) && <span className="muted">нет</span>}
                  </td>
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
