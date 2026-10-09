import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { RichText } from "@/components/RichText";
import { db, schema as s } from "@/db";
import { getCurrentDocument } from "@/lib/consent";
import { fmtDate } from "@/lib/format";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

async function load(slug: string) {
  return db.query.page.findFirst({ where: eq(s.page.slug, slug) });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page || !isPublic(page)) return { robots: { index: false } };
  return { title: page.seoTitle || page.title, description: page.seoDescription || undefined };
}

export default async function ContentPage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const page = await load(slug);
  const admin = isAdmin(await getViewer());
  if (!page || !canView(page, { admin, preview })) notFound();

  // Страницы согласий показывают ТЕКУЩУЮ редакцию из журнала согласий — ту же, что видит человек при регистрации
  const consentKind = slug === "consent" ? "PERSONAL_DATA" : slug === "marketing-consent" ? "MARKETING" : null;
  const doc = consentKind ? await getCurrentDocument(consentKind) : null;

  return (
    <>
      {!isPublic(page) && <PreviewBanner kind="Страница" visibility={page.visibility} editHref={`/admin/pages/${page.id}`} />}
      <article className="container doc">
        <h1>{page.title}</h1>
        {doc ? (
          <>
            <p className="muted small">Редакция от {fmtDate(doc.createdAt)}</p>
            <RichText text={doc.body} />
          </>
        ) : (
          <RichText text={page.body} />
        )}
      </article>
    </>
  );
}
