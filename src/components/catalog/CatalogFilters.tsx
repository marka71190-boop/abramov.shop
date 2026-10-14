"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { IconSearch } from "@/components/Icons";

interface Props {
  sorts: { value: string; label: string }[];
  sort: string;
  showSearch: boolean;
  priceRange: { min: number; max: number } | null;
}

/** Сортировка и фильтры каталога. Меняют адрес страницы — фильтры можно отправить ссылкой. */
export function CatalogFilters({ sorts, sort, showSearch, priceRange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [stock, setStock] = useState(params.get("stock") === "1");
  const [sortValue, setSortValue] = useState(sort);

  // Если адрес поменялся снаружи (поиск в шапке, «Сбросить») — подтягиваем значения в поля
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setMin(params.get("min") ?? "");
    setMax(params.get("max") ?? "");
    setStock(params.get("stock") === "1");
  }, [params]);
  useEffect(() => setSortValue(sort), [sort]);

  function apply(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 7);
  const applyPrice = () => {
    if (min === (params.get("min") ?? "") && max === (params.get("max") ?? "")) return;
    apply({ min: min || null, max: max || null });
  };

  return (
    <div className="cfilters" data-pending={pending || undefined}>
      {showSearch && (
        <form
          className="cfilters__search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() || null, sort: null });
          }}
        >
          <IconSearch size={18} />
          <input
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти в каталоге"
            aria-label="Поиск по каталогу"
            maxLength={100}
            enterKeyHint="search"
          />
        </form>
      )}
      <label className="cfilters__field">
        <span className="label">Сортировка</span>
        <select
          className="select"
          value={sortValue}
          onChange={(e) => {
            setSortValue(e.target.value);
            apply({ sort: e.target.value });
          }}
        >
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <form
        className="cfilters__field"
        onSubmit={(e) => {
          e.preventDefault();
          applyPrice();
        }}
      >
        <span className="label">Цена, ₽</span>
        <div className="cfilters__price">
          <input
            className="input"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(digits(e.target.value))}
            onBlur={applyPrice}
            placeholder={priceRange ? `от ${priceRange.min}` : "от"}
            aria-label="Цена от"
          />
          <input
            className="input"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(digits(e.target.value))}
            onBlur={applyPrice}
            placeholder={priceRange ? `до ${priceRange.max}` : "до"}
            aria-label="Цена до"
          />
          <button type="submit" hidden />
        </div>
      </form>
      <label className="check cfilters__stock">
        <input
          type="checkbox"
          checked={stock}
          onChange={(e) => {
            setStock(e.target.checked);
            apply({ stock: e.target.checked ? "1" : null });
          }}
        />
        <span>Только в наличии</span>
      </label>
    </div>
  );
}
