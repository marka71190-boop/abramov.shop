"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrow, IconSearch } from "@/components/Icons";
import { rub } from "@/lib/format";

interface Suggest {
  products: {
    slug: string;
    name: string;
    price: number;
    multiPrice: boolean;
    image: string | null;
    inStock: boolean;
  }[];
  categories: { slug: string; name: string }[];
  total: number;
  corrected: string | null;
}

/** Поиск в шапке: кнопка-лупа открывает панель с подсказками. Пустая панель — быстрые ссылки на категории. */
export function HeaderSearch({ categories }: { categories: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Suggest | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Закрываем при переходе на другую страницу
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Горячая клавиша «/» открывает поиск
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !open && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    setActive(-1);
    if (!query) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Suggest | null) => {
          if (d) setData(d);
          setLoading(false);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const results = data?.products ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    if (active >= 0 && results[active]) return router.push(`/product/${results[active].slug}`);
    const query = q.trim();
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    }
  }

  return (
    <>
      <button type="button" className="icon-btn" aria-label="Поиск" onClick={() => setOpen(true)}>
        <IconSearch />
      </button>
      {/* В body через портал: у шапки backdrop-filter, внутри неё fixed-панель обрезалась бы */}
      {open &&
        createPortal(
          <div className="search" role="dialog" aria-modal="true" aria-label="Поиск по магазину">
            <div className="search__backdrop" onClick={() => setOpen(false)} />
            <div className="search__panel">
              <form className="container search__form" onSubmit={submit} role="search">
                <IconSearch size={22} className="search__icon" />
                <input
                  ref={input}
                  className="search__input"
                  type="search"
                  name="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Поиск: кий, мел, перчатка…"
                  autoComplete="off"
                  enterKeyHint="search"
                  maxLength={100}
                  aria-autocomplete="list"
                  aria-controls="search-results"
                  aria-activedescendant={active >= 0 ? `sr-${active}` : undefined}
                />
                <button type="button" className="search__close" onClick={() => setOpen(false)} aria-label="Закрыть поиск">
                  ✕
                </button>
              </form>

              <div
                className="container search__body"
                id="search-results"
                onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
              >
                {!q.trim() ? (
                  <>
                    <div className="label">Разделы</div>
                    <div className="search__cats">
                      <Link href="/catalog" className="vchip">
                        Весь каталог
                      </Link>
                      {categories.map((c) => (
                        <Link key={c.slug} href={`/catalog/${c.slug}`} className="vchip">
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : !data && loading ? (
                  <p className="muted small">Ищем…</p>
                ) : data && data.total === 0 ? (
                  <p className="muted">
                    По запросу «{q.trim()}» ничего не нашлось. Попробуйте написать короче или{" "}
                    <Link href="/catalog">посмотрите весь каталог</Link>.
                  </p>
                ) : data ? (
                  <>
                    {data.corrected && <p className="muted small">Показываем результаты по запросу «{data.corrected}»</p>}
                    {data.categories.length > 0 && (
                      <div className="search__cats">
                        {data.categories.map((c) => (
                          <Link key={c.slug} href={`/catalog/${c.slug}`} className="vchip">
                            {c.name}
                          </Link>
                        ))}
                      </div>
                    )}
                    <ul className="search__list" role="listbox">
                      {results.map((p, i) => (
                        <li key={p.slug} role="option" id={`sr-${i}`} aria-selected={i === active}>
                          <Link href={`/product/${p.slug}`} className="search__item" data-active={i === active || undefined}>
                            {p.image ? <img src={p.image} alt="" /> : <span className="search__noimg" />}
                            <span className="search__name">
                              {p.name}
                              {!p.inStock && <span className="muted small"> · нет в наличии</span>}
                            </span>
                            <span className="search__price">
                              {p.multiPrice ? "от " : ""}
                              {rub(p.price)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {data.total > results.length && (
                      <Link href={`/catalog?q=${encodeURIComponent(data.corrected ?? q.trim())}`} className="btn btn--line btn--sm">
                        Все результаты: {data.total} <IconArrow size={16} />
                      </Link>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
