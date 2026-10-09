import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";

const ACTION: Record<string, string> = {
  "user.ban": "Заблокировал клиента",
  "user.unban": "Разблокировал клиента",
  "user.bonus": "Изменил бонусы",
  "user.role": "Изменил роль",
  "page.create": "Создал страницу",
  "page.update": "Изменил страницу",
  "page.delete": "Удалил страницу",
  "page.visibility": "Видимость страницы",
  "category.visibility": "Видимость категории",
  "product.visibility": "Видимость товара",
  "settings.update": "Изменил настройки",
  "consent.export": "Выгрузил журнал согласий",
};

export default async function AuditPage() {
  const rows = await db
    .select({ log: s.auditLog, actorName: s.user.name, actorEmail: s.user.email })
    .from(s.auditLog)
    .leftJoin(s.user, eq(s.auditLog.actorId, s.user.id))
    .orderBy(desc(s.auditLog.createdAt))
    .limit(200);

  return (
    <>
      <h1>Журнал действий</h1>
      <p className="muted" style={{ margin: 0 }}>
        Последние 200 действий в админке: кто и что менял.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Когда (МСК)</th>
              <th>Кто</th>
              <th>Действие</th>
              <th>Подробности</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ log, actorName, actorEmail }) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(log.createdAt)}</td>
                <td>
                  {actorName ?? "—"}
                  <div className="muted small">{actorEmail}</div>
                </td>
                <td>
                  {ACTION[log.action] ?? log.action}
                  {log.entity === "user" && log.entityId && (
                    <div className="small">
                      <Link href={`/admin/customers/${log.entityId}`}>Открыть клиента</Link>
                    </div>
                  )}
                </td>
                <td className="muted small" style={{ maxWidth: 420, wordBreak: "break-word" }}>
                  {log.details ? JSON.stringify(log.details) : ""}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="muted">
                  Пока пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
