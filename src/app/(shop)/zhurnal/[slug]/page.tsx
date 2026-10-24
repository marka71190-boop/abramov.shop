import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/journal/ArticleBody";
import { PreviewBanner } from "@/components/PreviewBanner";
import { ProductCard } from "@/components/product/ProductCard";
import { db, schema as s } from "@/db";
import { getPublicProductsByIds } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";
import { articleBySlug, articleDate, moreArticles } from "@/lib/journal";
import { productSlugsIn, readMinutes, SECTIONS } from "@/lib/journal-shared";
import { breadcrumbs, ldJson, og, shareImage, snippet } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await articleBySlug(slug);
  if (!a || !isPublic(a)) return { robots: { index: false } };
  const description = a.seoDescription || a.excerpt || snippet(a.body, a.title);
  return {
    title: a.seoTitle || a.title,
    description,
    alternates: { canonical: `/zhurnal/${a.slug}` },
    openGraph: { ...og({ url: `/zhurnal/${a.slug}`, title: a.title, description, images: a.cover ? [{ url: shareImage(a.cover)!, alt: a.title }] : undefined }), type: "article" as const },
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const a = await articleBySlug(slug);
  const viewer = await getViewer();
  if (!a || !canView(a, { admin: isAdmin(viewer), preview })) notFound();

  // Товары: из текста ([[product:…]]) и выбранные в админке
  const slugs = productSlugsIn(a.body);
  const bySlug = slugs.length ? await db.select({ id: s.product.id, slug: s.product.slug }).from(s.product).where(inArray(s.product.slug, slugs)) : [];
  const ids = [...new Set([...bySlug.map((x) => x.id), ...a.productIds])];
  const [cards, more] = await Promise.all([ids.length ? getPublicProductsByIds(ids) : Promise.resolve([]), moreArticles(a)]);
  const cardBySlug = new Map(cards.map((c) => [c.slug, c]));
  const extra = cards.filter((c) => a.productIds.includes(c.id) && !slugs.includes(c.slug));
  const date = articleDate(a);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt || undefined,
    image: a.cover ? [shareImage(a.cover)] : undefined,
    datePublished: date.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    mainEntityOfPage: `${SITE.url}/zhurnal/${a.slug}`,
  };

  return (
    <>
      {!isPublic(a) && <PreviewBanner kind="Статья" visibility={a.visibility} editHref={`/admin/journal/${a.id}`} />}
      <article className="container section article" style={{ paddingTop: "clamp(32px, 5vw, 64px)" }}>
        <p className="small" style={{ margin: "0 0 16px" }}>
          <Link href="/zhurnal">← Журнал</Link>
          {" · "}
          <Link href={`/zhurnal?r=${a.section}`}>{SECTIONS[a.section] ?? "Статьи"}</Link>
        </p>
        <header className="article__head">
          <h1 className="h2">{a.title}</h1>
          {a.excerpt && <p className="article__lead">{a.excerpt}</p>}
          <div className="small muted">
            {fmtDate(date)} · {readMinutes(a.body)} мин чтения
          </div>
        </header>
        {a.cover && (
          <div className="article__cover">
            <img src={a.cover} alt={a.title} />
          </div>
        )}
        <ArticleBody body={a.body} products={cardBySlug} title={a.title} poster={a.cover} />
        {extra.length > 0 && (
          <div className="article__more">
            <h2 className="h3">Товары из статьи</h2>
            <div className="products products--rail">
              {extra.map((c) => (
                <ProductCard key={c.id} p={c} favorite={false} />
              ))}
            </div>
          </div>
        )}
        {more.length > 0 && (
          <div className="article__more">
            <h2 className="h3">Ещё почитать</h2>
            <div className="jgrid">
              {more.map((m) => (
                <Link key={m.id} href={`/zhurnal/${m.slug}`} className="jcard">
                  <div className="jcard__img">{m.cover ? <img src={m.cover} alt="" loading="lazy" /> : <span className="ph" />}</div>
                  <div className="jcard__body">
                    <span className="label gold">{SECTIONS[m.section] ?? "Статья"}</span>
                    <b className="jcard__title">{m.title}</b>
                    <span className="small muted">{readMinutes(m.body)} мин</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
      {isPublic(a) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />}
      {isPublic(a) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: ldJson(
              breadcrumbs([
                { name: "Журнал", url: "/zhurnal" },
                { name: a.title, url: `/zhurnal/${a.slug}` },
              ]),
            ),
          }}
        />
      )}
    </>
  );
}
