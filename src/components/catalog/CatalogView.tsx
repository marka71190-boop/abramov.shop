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

const num = (v: string | undefined) => {
  if (v == null || v === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Параметры из адреса: ?q=&cat=&stock=1&min=&max=&sort=&page= и характеристики f_brand=Kamui|Taom, f_weight_min=700 */
export function parseCatalogParams(sp: RawSearch): CatalogParams {
  const attrs: Record<string, string[]> = {};
  const ranges: Record<string, { min?: number; max?: number }> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (!k.startsWith("f_")) continue;
    const val = one(v);
    if (!val) continue;
    const m = /^f_(.+)_(min|max)$/.exec(k);
    if (m) {
      const n = num(val);
      if (n != null) ranges[m[1]] = { ...ranges[m[1]], [m[2]]: n };
    } else attrs[k.slice(2)] = val.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  }
  return {
    attrs,
    ranges,
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
  const hasFilters = !!(params.cat || params.inStock || params.min || params.max || Object.keys(params.attrs ?? {}).length || Object.keys(params.ranges ?? {}).length);
  const keep = (skip: string[]) =>
    Object.entries(raw)
      .map(([k, v]) => [k, one(v)] as const)
      .filter(([k, v]) => v && k !== "page" && !skip.includes(k));
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

      {res.facets.length > 0 && (
        <div className="facets" aria-label="Фильтры по характеристикам">
          {res.facets.map((f) =>
            f.type === "select" ? (
              <div key={f.key} className="facet">
                <span className="facet__name">{f.name}</span>
                {f.values!.map((v) => {
                  const cur = f.values!.filter((x) => x.on).map((x) => x.value);
                  const next = v.on ? cur.filter((x) => x !== v.value) : [...cur, v.value];
                  return (
                    <Link key={v.value} href={href({ [`f_${f.key}`]: next.length ? next.join("|") : null })} className="vchip" aria-current={v.on ? "true" : undefined} scroll={false}>
                      {v.value}
                      {f.unit ? ` ${f.unit}` : ""} <span className="muted">{v.count}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <form key={f.key} className="facet" method="get" action={basePath}>
                {keep([`f_${f.key}_min`, `f_${f.key}_max`]).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v!} />
                ))}
                <span className="facet__name">
                  {f.name}
                  {f.unit ? `, ${f.unit}` : ""}
                </span>
                <input className="input" name={`f_${f.key}_min`} inputMode="decimal" placeholder={`от ${String(f.range!.min).replace(".", ",")}`} defaultValue={f.range!.from ?? ""} aria-label={`${f.name} от`} />
                <input className="input" name={`f_${f.key}_max`} inputMode="decimal" placeholder={`до ${String(f.range!.max).replace(".", ",")}`} defaultValue={f.range!.to ?? ""} aria-label={`${f.name} до`} />
                <button className="btn btn--line btn--sm">OK</button>
              </form>
            ),
          )}
        </div>
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
