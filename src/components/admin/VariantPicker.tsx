"use client";
import { useMemo, useState } from "react";
import { codeMatches } from "@/lib/code-match";

export interface PickOption {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  stock: number;
  price: number;
  cost: number | null;
  image: string | null;
}

const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е");

/** Поиск товара по названию или артикулу: выбор из подсказок */
export function VariantPicker({
  options,
  onPick,
  placeholder = "Название или артикул",
  exclude,
  autoFocus,
  hint,
}: {
  options: PickOption[];
  onPick: (o: PickOption) => void;
  placeholder?: string;
  exclude?: Set<string>;
  autoFocus?: boolean;
  hint?: (o: PickOption) => string;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return options
      .filter((o) => !exclude?.has(o.id))
      .filter((o) => {
        const hay = norm(`${o.name} ${o.sku ?? ""} ${o.barcode ?? ""}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 12);
  }, [q, options, exclude]);

  const pick = (o: PickOption) => {
    onPick(o);
    setQ("");
  };

  return (
    <div className="vpick">
      <input
        className="input"
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Сканер штрихкода/артикул: точное совпадение артикула — сразу добавляем
            const exact = options.find((o) => codeMatches(o, q));
            if (exact) pick(exact);
            else if (list.length === 1) pick(list[0]);
          }
        }}
        placeholder={placeholder}
        aria-label="Найти товар"
        autoComplete="off"
      />
      {list.length > 0 && (
        <ul className="vpick__list" role="listbox">
          {list.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => pick(o)}>
                {o.image ? <img src={o.image} alt="" className="admin-thumb" loading="lazy" /> : <span className="admin-thumb" />}
                <span className="vpick__name">
                  {o.name}
                  <span className="muted small">{[o.sku, hint ? hint(o) : `в наличии ${o.stock} шт`].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && !list.length && <div className="muted small">Не нашли — проверьте название или артикул</div>}
    </div>
  );
}
