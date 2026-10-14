import Link from "next/link";
import { Suspense } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { SORTS, type CatalogParams, type Sort, listCatalog } from "@/lib/catalog-search";
import { favoriteIds, ratingsFor } from "@/lib/reviews";
import type { UserRow } from "@/lib/viewer";
import { CatalogFilters } from "./CatalogFilters";

export type RawSearch = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
const int = (v: string | undefined) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Параметры из адреса: ?q=&cat=&stock=1&min=&max=&sort=&page= */
export function parseCatalogParams(sp: RawSearch): CatalogParams {
  return {
    q: one(sp.q)?.slice(0, 100),
    cat: one(sp.cat),
    inStock: one(sp.stock) === "1",
    min: int(one(sp.min)),
    max: int(one(sp.max)),
    sort: one(sp.sort) as Sort | undefined,
    page: int(one(sp.page)),
  };
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "товар";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "товара";
  return "товаров";
}

interface Props {
  basePath: string;
  params: CatalogParams;
  raw: RawSearch;
  viewer: UserRow | null;
  /** /catalog — с поиском и списком категорий; /catalog/[slug] — без них */
  isAll: boolean;
}

export async function CatalogView({ basePath, params, raw, viewer, isAll }: Props) {
  const res = await listCatalog(params);
  const [ratings, favs] = await Promise.all([
    ratingsFor(res.items.map((p) => p.id)),
    viewer ? favoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      const val = one(v);
      if (val && k !== "page") next.set(k, val);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const sorts = (Object.keys(SORTS) as Sort[]).filter((k) => k !== "relevance" || params.q).map((k) => ({ value: k, label: SORTS[k] }));
  const hasFilters = !!(params.cat || params.inStock || params.min || params.max);
  const filtered = !!params.q || hasFilters;

  return (
    <>
      <Suspense fallback={<div className="cfilters" />}>
        <CatalogFilters sorts={sorts} sort={res.sort} showSearch={isAll} priceRange={res.priceRange} />
      </Suspense>

      {isAll && res.categories.length > 1 && (
        <nav className="cchips" aria-label="Категории">
          <Link href={href({ cat: null })} className="vchip" aria-current={!res.activeCat ? "true" : undefined} scroll={false}>
            Все
          </Link>
          {res.categories.map((c) => (
            <Link
              key={c.slug}
              href={href({ cat: c.slug })}
              className="vchip"
              aria-current={res.activeCat?.slug === c.slug ? "true" : undefined}
              scroll={false}
            >
              {c.name} <span className="muted">{c.count}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="cmeta muted small">
        {res.corrected ? (
          <>
            По запросу «{params.q}» ничего нет, показываем «{res.corrected}
            ».{" "}
          </>
        ) : null}
        {res.total > 0 ? `${res.total} ${plural(res.total)}` : null}
        {filtered && (
          <>
            {" · "}
            <Link href={basePath} scroll={false}>
              Сбросить фильтры
            </Link>
          </>
        )}
      </div>

      {res.items.length === 0 ? (
        <div className="empty">
          {params.q && <p>По запросу «{params.q}» ничего не нашлось. Попробуйте написать короче или другими словами.</p>}
          {hasFilters ? (
            <p>
              Под выбранные фильтры товаров нет.{" "}
              <Link href={params.q ? `${basePath}?q=${encodeURIComponent(params.q)}` : basePath}>Сбросить фильтры</Link>
            </p>
          ) : !params.q ? (
            <p>Товары скоро появятся.</p>
          ) : (
            <p>
              <Link href={basePath}>Посмотреть весь каталог</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="products">
            {res.items.map((p) => (
              <ProductCard key={p.id} p={p} rating={ratings.get(p.id)} favorite={favs.has(p.id)} />
            ))}
          </div>
          {res.hasMore && (
            <div className="cmore">
              <Link href={href({ page: String(res.page + 1) })} className="btn btn--line" scroll={false}>
                Показать ещё
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
