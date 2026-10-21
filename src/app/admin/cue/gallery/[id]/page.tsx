import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { parseCueKey, resolveCue } from "@/lib/cue-config";
import { getCueConfig } from "@/lib/cue";
import { rub } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { ShowcaseForm } from "./ShowcaseForm";

export default async function ShowcaseEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [r, cfg] = await Promise.all([db.query.cueShowcase.findFirst({ where: eq(s.cueShowcase.id, id) }), getCueConfig()]);
  if (!r) notFound();
  const sel = r.cueKey ? parseCueKey(r.cueKey) : null;
  const res = sel ? resolveCue(cfg, sel) : null;
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/cue/gallery">← Галерея</Link>
      </p>
      <h1>{r.title}</h1>
      <div className="panel stack" style={{ gap: 6 }}>
        <h2 style={{ margin: 0 }}>Сборка</h2>
        {!r.cueKey ? (
          <p className="muted small" style={{ margin: 0 }}>Сборка не указана — кнопки «Собрать такой же» не будет.</p>
        ) : typeof res === "string" || !res ? (
          <p className="form-error" style={{ margin: 0 }}>Эту сборку уже нельзя повторить по текущему прайсу (вариант убран) — кнопки «Собрать такой же» не будет.</p>
        ) : (
          <>
            <div className="small" style={{ whiteSpace: "pre-line" }}>{res.spec.map((x) => `${x.group}: ${x.value}`).join("\n")}</div>
            <div className="small">
              Такой же сейчас стоит <b>{rub(res.price)}</b> ·{" "}
              <a href={`/cue?c=${encodeURIComponent(r.cueKey)}`} target="_blank" rel="noreferrer">
                открыть в конструкторе
              </a>
            </div>
          </>
        )}
      </div>
      <ShowcaseForm
        item={{ id: r.id, title: r.title, description: r.description, photos: r.photos, cueKey: r.cueKey ?? "", sortOrder: r.sortOrder, published: r.published }}
      />
    </>
  );
}
