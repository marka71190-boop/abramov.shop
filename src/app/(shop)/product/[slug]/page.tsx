import type { Metadata } from "next";
import Link from "next/link";
import { AddToCart } from "@/components/cart/AddToCart";
import { FavoriteButton } from "@/components/product/FavoriteButton";
import { ReviewForm } from "@/components/product/ReviewForm";
import { Stars } from "@/components/product/Stars";
import { StockAlert } from "@/components/product/StockAlert";
import { approvedReviews, isFavorite, isSubscribed, myReview, ratingsFor, reviewableOrder, shortName } from "@/lib/reviews";
import { SITE } from "@/lib/site";
import { KeepBeta } from "@/components/RichText";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { getProductBySlug } from "@/lib/catalog";
import { fmtDate, num, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
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
  const viewer = await getViewer();
  const admin = isAdmin(viewer);
  if (!p || !canView(p, { admin, preview })) notFound();
  // Товар из скрытой категории тоже не показываем покупателям
  if (p.category && !isPublic(p.category) && !admin && preview !== p.previewToken) notFound();

  const stock = p.variants.reduce((a, v) => a + v.stock, 0);
  const settings = await getSettings();
  const cover = p.images[0];
  const [reviews, ratings, fav, alert, canReview, mine] = await Promise.all([
    approvedReviews(p.id),
    ratingsFor([p.id]),
    viewer ? isFavorite(viewer.id, p.id) : false,
    viewer ? isSubscribed(viewer.id, p.id) : false,
    viewer ? reviewableOrder(viewer.id, p.id) : null,
    viewer ? myReview(viewer.id, p.id) : null,
  ]);
  const rating = ratings.get(p.id);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description.slice(0, 500),
    image: p.images.map((i) => (i.url.startsWith("http") ? i.url : `${SITE.url}${i.url}`)),
    sku: p.sku ?? undefined,
    brand: { "@type": "Brand", name: "Abramov Shop" },
    offers: {
      "@type": "Offer",
      price: (p.price / 100).toFixed(2),
      priceCurrency: "RUB",
      availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE.url}/product/${p.slug}`,
    },
    ...(rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.avg, reviewCount: rating.count } } : {}),
  };

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
            {rating && (
              <a href="#reviews" className="row small" style={{ gap: 8, color: "inherit", textDecoration: "none" }}>
                <Stars value={rating.avg} /> {rating.avg.toFixed(1)} · {rating.count} {plural(rating.count, "отзыв", "отзыва", "отзывов")}
              </a>
            )}
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
            {stock > 0 ? (
              <AddToCart
                variants={p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price ?? p.price, stock: v.stock }))}
                maxPerItem={settings.checkout.maxQtyPerItem}
              />
            ) : (
              <StockAlert productId={p.id} initial={alert} />
            )}
            <FavoriteButton productId={p.id} initial={fav} variant="button" />
          </div>
        </div>
        {p.images.length > 1 && (
          <div className="products" style={{ marginTop: 16 }}>
            {p.images.slice(1).map((img) => (
              <img key={img.id} className="pcard__img" src={img.url} alt={img.alt} />
            ))}
          </div>
        )}
        <div id="reviews" className="reviews">
          <div className="section-head" style={{ marginBottom: 20 }}>
            <h2 className="h3">Отзывы{rating ? ` · ${rating.avg.toFixed(1)}` : ""}</h2>
            {settings.loyalty.reviewBonus > 0 && <p>За отзыв о купленном товаре — {num(settings.loyalty.reviewBonus)} бонусов</p>}
          </div>
          {canReview && (!mine || mine.status !== "APPROVED") && (
            mine?.status === "PENDING" ? (
              <div className="notice notice--muted" style={{ margin: "0 0 16px" }}>
                Ваш отзыв на проверке — скоро появится здесь.
              </div>
            ) : (
              <ReviewForm productId={p.id} initial={mine ? { rating: mine.rating, text: mine.text, photos: mine.photos } : null} />
            )
          )}
          {!canReview && viewer && !reviews.length && <p className="muted">Пока нет отзывов. Оставить отзыв можно после получения заказа.</p>}
          {!viewer && !reviews.length && <p className="muted">Пока нет отзывов.</p>}
          <div className="review-list">
            {reviews.map((r) => (
              <article key={r.id} className="review">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Stars value={r.rating} />
                    <strong>{shortName(r.user.name)}</strong>
                    {r.orderId && <span className="pill pill--ok">Купил на сайте</span>}
                  </div>
                  <span className="muted small">{fmtDate(r.createdAt)}</span>
                </div>
                <p style={{ margin: "10px 0 0", whiteSpace: "pre-line" }}>{r.text}</p>
                {r.photos.length > 0 && (
                  <div className="row" style={{ marginTop: 10 }}>
                    {r.photos.map((ph) => (
                      <a key={ph} href={ph} target="_blank" rel="noreferrer" className="review-thumb">
                        <img src={ph} alt="Фото покупателя" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                {r.adminReply && (
                  <div className="review__reply">
                    <span className="label">Abramov Shop</span>
                    <p style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>{r.adminReply}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      {isPublic(p) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
