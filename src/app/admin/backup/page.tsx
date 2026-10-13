import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";

export default async function BackupPage() {
  await requireAdmin("OWNER");
  const last = await db.query.auditLog.findMany({ where: eq(s.auditLog.action, "backup.download"), orderBy: desc(s.auditLog.createdAt), limit: 5 });
  return (
    <>
      <h1>Резервные копии</h1>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>1. Автоматические копии в Timeweb — главное</h2>
        <p className="muted" style={{ margin: 0 }}>
          Timeweb → «Базы данных» → ваша база PostgreSQL → вкладка «Бэкапы» → включите автоматическое создание (ежедневно) и
          храните не меньше 7 копий. Восстановление — там же, одной кнопкой. Копии хранятся в России, как требует закон о
          персональных данных.
        </p>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>2. Копия себе на компьютер</h2>
        <p className="muted" style={{ margin: 0 }}>
          Все клиенты, заказы, согласия, товары, бонусы и настройки в одном файле. Скачивайте раз в неделю и перед большими
          изменениями. Файл содержит персональные данные — храните его только у себя, не пересылайте в мессенджеры.
        </p>
        <div className="row">
          <a className="btn btn--gold btn--sm" href="/admin/backup/download">
            Скачать копию
          </a>
          <a className="btn btn--line btn--sm" href="/admin/backup/download?media=1">
            Скачать с фото товаров
          </a>
        </div>
        {last.length > 0 && (
          <div className="muted small">Последние скачивания: {last.map((l) => fmtDateTime(l.createdAt)).join(", ")}</div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Восстановить из файла можно командой <code>node scripts/restore.mjs файл.json.gz</code> — инструкция в README проекта.
        </p>
      </div>
    </>
  );
}
