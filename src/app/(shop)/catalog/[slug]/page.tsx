import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogView, parseCatalogParams, type RawSearch } from "@/components/catalog/CatalogView";
import { PreviewBanner } from "@/components/PreviewBanner";
import { db, schema as s } from "@/db";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearch>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const cat = await db.query.category.findFirst({
    where: eq(s.category.slug, slug),
  });
  if (!cat || !isPublic(cat)) return { robots: { index: false } };
  const filtered = Object.keys(sp).some((k) => k !== "preview");
  return {
    title: cat.name,
    description: cat.description?.slice(0, 160) || `${cat.name} в Abramov Shop: доставка СДЭК по всей России, бонусы с каждой покупки.`,
    alternates: { canonical: `/catalog/${cat.slug}` },
    robots: filtered || !isPublic(cat) ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const preview = typeof raw.preview === "string" ? raw.preview : undefined;
  const cat = await db.query.category.findFirst({
    where: eq(s.category.slug, slug),
  });
  const viewer = await getViewer();
  const admin = isAdmin(viewer);
  if (!cat || !canView(cat, { admin, preview })) notFound();

  return (
    <>
      {!isPublic(cat) && <PreviewBanner kind="Категория" visibility={cat.visibility} editHref="/admin/catalog" />}
      <section className="container section" style={{ paddingTop: "clamp(40px, 6vw, 80px)" }}>
        <nav className="crumbs small muted" aria-label="Навигация">
          <Link href="/catalog">Каталог</Link> / <span>{cat.name}</span>
        </nav>
        <div className="section-head" style={{ marginBottom: 24 }}>
          <h1 className="h2">{cat.name}</h1>
          {cat.description && <p>{cat.description}</p>}
        </div>
        <CatalogView
          basePath={`/catalog/${cat.slug}`}
          params={{
            ...parseCatalogParams(raw),
            cat: undefined,
            fixedCategoryId: cat.id,
          }}
          raw={raw}
          viewer={viewer}
          isAll={false}
        />
      </section>
    </>
  );
}
