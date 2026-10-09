import { VISIBILITY_LABEL, type Visibility } from "@/lib/visibility";

/** Полоса над скрытой страницей: её видят только админы и обладатели ссылки предпросмотра. */
export function PreviewBanner({ kind, visibility, editHref }: { kind: string; visibility: Visibility; editHref: string }) {
  const status = visibility === "PUBLISHED" ? "запланирована" : VISIBILITY_LABEL[visibility].toLowerCase();
  return (
    <div className="notice notice--muted">
      {kind}: <strong>{status}</strong> — покупатели её не видят. <a href={editHref}>Открыть в админке</a>
    </div>
  );
}
