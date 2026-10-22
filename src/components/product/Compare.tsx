"use client";
/** Сравнение товаров: до 4 товаров, список хранится в браузере (без входа). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "as_compare";
const EVENT = "as-compare";
export const COMPARE_MAX = 4;

export function readCompare(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}
export function writeCompare(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, COMPARE_MAX)));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
function useCompare() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(readCompare());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return ids;
}

export function CompareButton({ productId }: { productId: string }) {
  const ids = useCompare();
  const on = ids.includes(productId);
  const full = !on && ids.length >= COMPARE_MAX;
  return (
    <button
      type="button"
      className="btn btn--line fav-btn"
      aria-pressed={on}
      title={full ? `Сравнивать можно до ${COMPARE_MAX} товаров` : undefined}
      onClick={() => {
        if (on) writeCompare(ids.filter((x) => x !== productId));
        else if (!full) writeCompare([...ids, productId]);
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M5 20V10M12 20V4M19 20v-7" strokeLinecap="round" />
      </svg>
      <span>{on ? "В сравнении" : full ? "Сравнение заполнено" : "Сравнить"}</span>
    </button>
  );
}

/** Плашка внизу экрана: «Сравнение · 2 → Открыть» */
export function CompareBar() {
  const ids = useCompare();
  const path = usePathname();
  if (!ids.length || path.startsWith("/compare") || path.startsWith("/checkout")) return null;
  return (
    <div className="compare-bar" role="status">
      <span>
        Сравнение: <b>{ids.length}</b> из {COMPARE_MAX}
      </span>
      <Link href={`/compare?ids=${ids.join(",")}`} className="btn btn--gold btn--sm">
        Сравнить
      </Link>
      <button type="button" className="compare-bar__x" aria-label="Очистить сравнение" onClick={() => writeCompare([])}>
        ×
      </button>
    </div>
  );
}

/** На странице сравнения: убрать товар */
export function CompareRemove({ productId, ids }: { productId: string; ids: string[] }) {
  return (
    <button
      type="button"
      className="linklike small"
      onClick={() => {
        const next = ids.filter((x) => x !== productId);
        writeCompare(next);
        window.location.href = next.length ? `/compare?ids=${next.join(",")}` : "/compare";
      }}
    >
      Убрать
    </button>
  );
}

/** Страница сравнения без ?ids — берём список из браузера */
export function CompareRedirect() {
  useEffect(() => {
    const ids = readCompare();
    if (ids.length) window.location.replace(`/compare?ids=${ids.join(",")}`);
  }, []);
  return null;
}
