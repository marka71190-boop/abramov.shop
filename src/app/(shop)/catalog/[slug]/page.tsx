import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { db, schema as s } from "@/db";
import { getPublicProductsByCategory } from "@/lib/catalog";
import { ProductCard } from "@/components/product/ProductCard";
import { favoriteIds, ratingsFor } from "@/lib/reviews";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const cat = await db.query.category.findFirst({ where: eq(s.category.slug, slug) });
  const viewer = await getViewer();
  const admin = isAdmin(viewer);
  if (!cat || !canView(cat, { admin, preview })) notFound();

  const products = await getPublicProductsByCategory(cat.id);
  const [ratings, favs] = await Promise.all([ratingsFor(products.map((p) => p.id)), viewer ? favoriteIds(viewer.id) : new Set<string>()]);

  return (
    <>
      {!isPublic(cat) && <PreviewBanner kind="Категория" visibility={cat.visibility} editHref="/admin/catalog" />}
      <section className="container section" style={{ paddingTop: "clamp(40px, 6vw, 80px)" }}>
        <div className="section-head">
          <h1 className="h2">{cat.name}</h1>
          {cat.description && <p>{cat.description}</p>}
        </div>
        {products.length === 0 ? (
          <p className="empty">Товары скоро появятся.</p>
        ) : (
          <div className="products">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} rating={ratings.get(p.id)} favorite={favs.has(p.id)} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
