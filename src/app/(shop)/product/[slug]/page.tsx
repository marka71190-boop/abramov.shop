import type { Metadata } from "next";
import Link from "next/link";
import { FavoriteButton } from "@/components/product/FavoriteButton";
import { ProductView } from "@/components/product/ProductView";
import { CompareButton } from "@/components/product/Compare";
import { ProductVideos } from "@/components/product/ProductVideos";
import { BundleOffer } from "@/components/product/BundleOffer";
import { bundlesFor } from "@/lib/bundles";
import { productSpecs } from "@/lib/attributes";
import { imageDims } from "@/lib/image-dims";
import { ReviewForm } from "@/components/product/ReviewForm";
import { Stars } from "@/components/product/Stars";
import { StockAlert } from "@/components/product/StockAlert";
import { myPendingQuestions, publicQuestions } from "@/lib/questions";
import { QuestionForm } from "@/components/product/QuestionForm";
import { approvedReviews, favoriteIds, isFavorite, isSubscribed, myReview, ratingsFor, reviewableOrder, shortName } from "@/lib/reviews";
import { ProductCard } from "@/components/product/ProductCard";
import { recommendFor } from "@/lib/recommend";
import { SITE } from "@/lib/site";
import { breadcrumbs, ldJson, og, shareImage, snippet } from "@/lib/seo";
import { KeepBeta } from "@/components/RichText";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { getProductBySlug } from "@/lib/catalog";
import { fmtDate, num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getViewer, isAdmin } from "@/lib/viewer";
import { canView, isPublic } from "@/lib/visibility";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string; v?: string; review?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { v }] = await Promise.all([params, searchParams]);
  const p = await getProductBySlug(slug);
  if (!p || !isPublic(p) || p.channel === "WHOLESALE" || (p.category && !isPublic(p.category))) return { robots: { index: false } };
  // Ссылка на вариант (?v=…) — в превью его фото и цена
  const variant = p.variants.find((x) => x.id === v);
  const photo = (variant && p.images.find((i) => i.variantId === variant.id)) ?? p.images.find((i) => !i.variantId) ?? p.images[0];
  const prices = p.variants.map((x) => x.price ?? p.price);
  const price = variant ? (variant.price ?? p.price) : prices.length ? Math.min(...prices) : p.price;
  const priceText = `${variant || new Set(prices).size <= 1 ? "" : "от "}${Math.round(price / 100).toLocaleString("ru-RU")} ₽`;
  const title = variant && p.variants.length > 1 ? `${p.name} — ${variant.name}` : p.name;
  const description = snippet(p.description, `${p.name} в Abramov Shop. Доставка СДЭК по всей России, бонусы с каждой покупки.`);
  const image = shareImage(photo?.url);
  return {
    title,
    description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: og({
      url: `/product/${p.slug}${variant ? `?v=${variant.id}` : ""}`,
      title: `${title} · ${priceText}`,
      description,
      images: image ? [{ url: image, alt: photo?.alt || p.name }] : undefined,
    }),
    twitter: { card: "summary_large_image" },
    other: { "product:price:amount": (price / 100).toFixed(2), "product:price:currency": "RUB" },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, { preview, v: wanted, review: reviewParam }] = await Promise.all([params, searchParams]);
  // Пришли из письма «Как вам покупка?» — оценка уже выбрана
  const presetRating = Math.min(5, Math.max(0, Math.trunc(Number(reviewParam) || 0)));
  const p = await getProductBySlug(slug);
  const viewer = await getViewer();
  const admin = isAdmin(viewer);
  if (!p || !canView(p, { admin, preview })) notFound();
  // «Только опт» — в оптовом каталоге /opt, отдельной страницы для розницы нет
  if (p.channel === "WHOLESALE" && !admin) notFound();
  // Товар из скрытой категории тоже не показываем покупателям
  if (p.category && !isPublic(p.category) && !admin && preview !== p.previewToken) notFound();

  const stock = p.variants.reduce((a, v) => a + v.stock, 0);
  const settings = await getSettings();
  const dims = await imageDims(p.images.map((i) => i.url));
  const gallery = p.images.map((i) => ({ url: i.url, alt: i.alt || p.name, variantId: i.variantId, w: dims.get(i.url)?.w ?? null, h: dims.get(i.url)?.h ?? null }));
  const variants = p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price ?? p.price, stock: v.stock }));
  // Вариант из ссылки (?v=…), иначе первый в наличии
  const initialVariant = variants.find((v) => v.id === wanted) ?? variants.find((v) => v.stock > 0) ?? variants[0];
  const [questions, myQuestions] = await Promise.all([publicQuestions(p.id), viewer ? myPendingQuestions(viewer.id, p.id) : Promise.resolve([])]);
  const [reviews, ratings, fav, alert, canReview, mine] = await Promise.all([
    approvedReviews(p.id),
    ratingsFor([p.id]),
    viewer ? isFavorite(viewer.id, p.id) : false,
    viewer ? isSubscribed(viewer.id, p.id) : false,
    viewer ? reviewableOrder(viewer.id, p.id) : null,
    viewer ? myReview(viewer.id, p.id) : null,
  ]);
  const rating = ratings.get(p.id);
  const related = await recommendFor([p.id], { limit: 8 });
  const [specs, bundles] = await Promise.all([productSpecs(p.id, p.categoryId), bundlesFor(p.id)]);
  const brandSpec = specs.find((x) => x.name === "Бренд");
  const [relRatings, relFavs] = await Promise.all([
    ratingsFor(related.map((r) => r.id)),
    viewer ? favoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description.slice(0, 500),
    image: p.images.map((i) => shareImage(i.url)!),
    sku: p.sku ?? undefined,
    brand: { "@type": "Brand", name: brandSpec?.value ?? "Abramov Shop" },
    additionalProperty: specs.length ? specs.map((x) => ({ "@type": "PropertyValue", name: x.name, value: x.value })) : undefined,
    // Несколько вариантов с разной ценой — диапазон цен
    offers:
      new Set(variants.map((v) => v.price)).size > 1
        ? {
            "@type": "AggregateOffer",
            lowPrice: (Math.min(...variants.map((v) => v.price)) / 100).toFixed(2),
            highPrice: (Math.max(...variants.map((v) => v.price)) / 100).toFixed(2),
            offerCount: variants.length,
            priceCurrency: "RUB",
            availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: `${SITE.url}/product/${p.slug}`,
          }
        : {
            "@type": "Offer",
            price: ((variants[0]?.price ?? p.price) / 100).toFixed(2),
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
        <ProductView
          track={{ id: p.sku ?? p.slug, name: p.name }}
          images={gallery}
          variants={variants}
          initialVariantId={initialVariant?.id ?? null}
          basePrice={p.price}
          oldPrice={p.oldPrice}
          maxPerItem={settings.checkout.maxQtyPerItem}
          badge={p.isLimited ? "Limited" : undefined}
          head={
            <>
              <h1 className="h2" style={{ fontSize: "clamp(32px, 3.6vw, 52px)" }}>
                <KeepBeta text={p.name} />
              </h1>
              {rating && (
                <a href="#reviews" className="row small" style={{ gap: 8, color: "inherit", textDecoration: "none" }}>
                  <Stars value={rating.avg} /> {rating.avg.toFixed(1)} · {rating.count} {plural(rating.count, "отзыв", "отзыва", "отзывов")}
                </a>
              )}
            </>
          }
          buyFallback={stock > 0 ? null : <StockAlert productId={p.id} initial={alert} />}
          extra={
            <>
              <FavoriteButton productId={p.id} initial={fav} variant="button" />
              <CompareButton productId={p.id} />
            </>
          }
          body={
            <>
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
              {specs.length > 0 && (
                <div className="pp__desc">
                  <div className="label">Характеристики</div>
                  <dl className="pp__specs">
                    {specs.map((x) => (
                      <div key={x.name} style={{ display: "contents" }}>
                        <dt>{x.name}</dt>
                        <dd>{x.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {p.description && (
                <div className="pp__desc">
                  <div className="label">Описание</div>
                  <p className="muted" style={{ whiteSpace: "pre-line", margin: "10px 0 0" }}>
                    {p.description}
                  </p>
                </div>
              )}
            </>
          }
        />
        {bundles.map((b) => (
          <BundleOffer key={b.id} bundle={b} />
        ))}
        <ProductVideos videos={p.videos} poster={gallery.find((g) => !g.variantId)?.url ?? gallery[0]?.url ?? null} productName={p.name} />
        {related.length > 0 && (
          <div className="related">
            <div className="section-head" style={{ marginBottom: 20 }}>
              <h2 className="h3">С этим покупают</h2>
            </div>
            <div className="products products--rail">
              {related.map((r) => (
                <ProductCard key={r.id} p={r} rating={relRatings.get(r.id)} favorite={relFavs.has(r.id)} />
              ))}
            </div>
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
              <ReviewForm
                productId={p.id}
                initial={mine ? { rating: mine.rating, text: mine.text, photos: mine.photos } : presetRating ? { rating: presetRating, text: "", photos: [] } : null}
              />
            )
          )}
          {!canReview && viewer && !reviews.length && <p className="muted">Пока нет отзывов. Оставить отзыв можно после получения заказа.</p>}
          {!viewer && presetRating > 0 && (
            <div className="notice notice--muted" style={{ margin: "0 0 16px" }}>
              Чтобы оставить отзыв, <Link href={`/login?next=${encodeURIComponent(`/product/${p.slug}?review=${presetRating}#reviews`)}`}>войдите в аккаунт</Link>, в котором оформляли заказ.
            </div>
          )}
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
        <div id="questions" className="questions">
          <div className="section-head" style={{ marginBottom: 20 }}>
            <h2 className="h3">Вопросы о товаре{questions.length ? ` · ${questions.length}` : ""}</h2>
          </div>
          {viewer ? (
            <QuestionForm productId={p.id} />
          ) : (
            <p className="muted">
              Есть вопрос о товаре? <Link href={`/login?next=${encodeURIComponent(`/product/${p.slug}#questions`)}`}>Войдите</Link> — ответим и пришлём ответ на почту.
            </p>
          )}
          <div className="qa-list">
            {myQuestions.map((q) => (
              <article key={q.id} className="qa qa--mine">
                <div className="qa__q">
                  <span className="qa__mark" aria-hidden>
                    В
                  </span>
                  <p>{q.text}</p>
                </div>
                <div className="small muted qa__meta">Ваш вопрос · {fmtDate(q.createdAt)} · ждёт ответа — его увидите только вы</div>
              </article>
            ))}
            {questions.slice(0, 5).map((q) => (
              <QA key={q.id} q={q} />
            ))}
          </div>
          {questions.length > 5 && (
            <details className="qa-more">
              <summary className="btn btn--line btn--sm">Ещё {questions.length - 5} {plural(questions.length - 5, "вопрос", "вопроса", "вопросов")}</summary>
              <div className="qa-list">
                {questions.slice(5).map((q) => (
                  <QA key={q.id} q={q} />
                ))}
              </div>
            </details>
          )}
          {!questions.length && !myQuestions.length && <p className="muted small" style={{ margin: "12px 0 0" }}>Пока никто не спрашивал — будьте первым.</p>}
        </div>
      </section>
      {isPublic(p) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />}
      {isPublic(p) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: ldJson(
              breadcrumbs([
                { name: "Каталог", url: "/catalog" },
                ...(p.category ? [{ name: p.category.name, url: `/catalog/${p.category.slug}` }] : []),
                { name: p.name, url: `/product/${p.slug}` },
              ]),
            ),
          }}
        />
      )}
    </>
  );
}

function QA({ q }: { q: Awaited<ReturnType<typeof publicQuestions>>[number] }) {
  return (
    <article className="qa">
      <div className="qa__q">
        <span className="qa__mark" aria-hidden>
          В
        </span>
        <p>{q.text}</p>
      </div>
      <div className="small muted qa__meta">
        {q.user ? shortName(q.user.name) : "Покупатель"} · {fmtDate(q.createdAt)}
      </div>
      {q.answer && (
        <div className="qa__a">
          <span className="qa__mark qa__mark--a" aria-hidden>
            О
          </span>
          <div>
            <span className="label">Abramov Shop</span>
            <p>{q.answer}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
