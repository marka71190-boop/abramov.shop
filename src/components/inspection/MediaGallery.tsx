import { fmtDateTime } from "@/lib/format";
import { DeleteMediaButton } from "./DeleteMediaButton";

interface Media {
  id: string;
  driveFileId: string;
  mimeType: string;
  name: string;
  driveCreatedAt: Date | null;
  createdAt: Date;
}

/** Фото и видео с Google Диска: просмотр прямо на странице, скачивание для зрителей отключено. */
export function MediaGallery({ media, canDelete = false }: { media: Media[]; canDelete?: boolean }) {
  if (!media.length) return null;
  return (
    <div className="mgallery">
      {media.map((m) => (
        <figure key={m.id} className="mgallery__item">
          <iframe
            src={`https://drive.google.com/file/d/${m.driveFileId}/preview`}
            title={m.mimeType.startsWith("video/") ? "Видео проверки" : "Фото проверки"}
            loading="lazy"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
          <figcaption className="small muted">
            {m.mimeType.startsWith("video/") ? "Видео" : "Фото"} · {fmtDateTime(m.driveCreatedAt ?? m.createdAt)}
            {" · "}
            <a href={`https://drive.google.com/file/d/${m.driveFileId}/view`} target="_blank" rel="noreferrer">
              открыть
            </a>
            {canDelete && <DeleteMediaButton id={m.id} />}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
