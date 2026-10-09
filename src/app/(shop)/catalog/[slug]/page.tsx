import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { db, schema as s } from "@/db";
import { getPublicProductsByCategory } from "@/lib/catalog";
import { rub } from "@/lib/format";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const cat = await db.query.category.findFirst({ where: eq(s.category.slug, slug) });
  const admin = isAdmin(await getViewer());
  if (!cat || !canView(cat, { admin, preview })) notFound();

  const products = await getPublicProductsByCategory(cat.id);

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
              <Link key={p.id} href={`/product/${p.slug}`} className="pcard">
                {p.image ? <img className="pcard__img" src={p.image.url} alt={p.image.alt} /> : <div className="pcard__img" />}
                <div className="pcard__body">
                  <div className="pcard__name">{p.name}</div>
                  <div className="pcard__price">
                    {rub(p.price)}
                    {p.oldPrice ? <span className="old-price">{rub(p.oldPrice)}</span> : null}
                  </div>
                  {p.stock <= 0 && <div className="muted small">Нет в наличии</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
