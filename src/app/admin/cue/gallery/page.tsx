import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";

export default async function GalleryAdmin() {
  await requireAdmin();
  const rows = await db.query.cueShowcase.findMany({ orderBy: [asc(s.cueShowcase.sortOrder), desc(s.cueShowcase.createdAt)] });
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/cue">← Кий на заказ</Link>
      </p>
      <h1>Галерея готовых «Чемпионов»</h1>
      <p className="muted" style={{ margin: 0 }}>
        Работы показываются на странице конструктора с кнопкой «Собрать такой же». Добавить работу: в заказе с кием после «Кий готов» — кнопка
        «В галерею» (возьмёт сборку и фото этапов), или в конструкторе соберите кий и нажмите «Сохранить в галерею». Гравировку с именем покупателя
        в галерею не переносим; на фото не должно быть людей и гравировки с именем.
      </p>
      {rows.length ? (
        <div className="showcase-admin">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/cue/gallery/${r.id}`} className="panel showcase-admin__item">
              {r.photos[0] ? <img src={r.photos[0]} alt="" /> : <span className="ph" />}
              <div>
                <b>{r.title}</b>
                <div className="muted small">
                  {r.published ? "на сайте" : "скрыто"} · {r.photos.length} фото · {fmtDate(r.createdAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">Пока пусто.</p>
      )}
    </>
  );
}
