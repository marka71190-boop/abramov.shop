import type { Metadata } from "next";
import Link from "next/link";
import { KeepBeta } from "@/components/RichText";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { getProductBySlug } from "@/lib/catalog";
import { num, rub } from "@/lib/format";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p || !isPublic(p)) return { robots: { index: false } };
  return { title: p.name, description: p.description.slice(0, 160) };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const p = await getProductBySlug(slug);
  const admin = isAdmin(await getViewer());
  if (!p || !canView(p, { admin, preview })) notFound();
  // Товар из скрытой категории тоже не показываем покупателям
  if (p.category && !isPublic(p.category) && !admin && preview !== p.previewToken) notFound();

  const stock = p.variants.reduce((a, v) => a + v.stock, 0);
  const cover = p.images[0];

  return (
    <>
      {!isPublic(p) && <PreviewBanner kind="Товар" visibility={p.visibility} editHref="/admin/catalog" />}
      <section className="container section" style={{ paddingTop: "clamp(32px, 5vw, 64px)" }}>
        {p.category && (
          <p className="small" style={{ margin: "0 0 20px" }}>
            <Link href={`/catalog/${p.category.slug}`}>← {p.category.name}</Link>
          </p>
        )}
        <div className="drop">
          <div className="drop__media">
            {cover && <img src={cover.url} alt={cover.alt} />}
            {p.isLimited && <span className="tag">Limited</span>}
          </div>
          <div className="drop__body">
            <h1 className="h2" style={{ fontSize: "clamp(32px, 3.6vw, 52px)" }}>
              <KeepBeta text={p.name} />
            </h1>
            <p className="muted" style={{ whiteSpace: "pre-line" }}>
              {p.description}
            </p>
            {p.isLimited && p.limitedTotal ? (
              <div className="meter">
                <div className="meter__row">
                  <span className="muted">Осталось</span>
                  <strong>
                    {num(stock)} из {num(p.limitedTotal)}
                  </strong>
                </div>
                <div className="meter__bar">
                  <div className="meter__fill" style={{ width: `${Math.min(100, (stock / p.limitedTotal) * 100)}%` }} />
                </div>
              </div>
            ) : null}
            <div className="price-big">
              {rub(p.price)}
              {p.oldPrice ? <span className="old-price">{rub(p.oldPrice)}</span> : null}
            </div>
            <button className="btn btn--gold btn--block" disabled title="Корзина подключается">
              {stock > 0 ? "В корзину — скоро" : "Нет в наличии"}
            </button>
          </div>
        </div>
        {p.images.length > 1 && (
          <div className="products" style={{ marginTop: 16 }}>
            {p.images.slice(1).map((img) => (
              <img key={img.id} className="pcard__img" src={img.url} alt={img.alt} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
