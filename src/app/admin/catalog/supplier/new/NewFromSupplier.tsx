"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GrabbedItem } from "@/lib/fortu";
import { splitTitles } from "@/lib/fortu-parse";
import { rub } from "@/lib/format";
import { supplierCreateAction, supplierGrabAction, supplierSearchAction } from "../actions";

interface Found {
  path: string;
  title: string;
}
interface Created {
  id: string;
  name: string;
  price: number;
  variants: number;
}

export function NewFromSupplier({ categories }: { categories: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found[]>([]);
  const [refs, setRefs] = useState("");
  const [oneProduct, setOneProduct] = useState(true);
  const [name, setName] = useState<string | null>(null); // null — предлагаем сами
  const [vnames, setVnames] = useState<Record<string, string>>({});
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created[]>([]);

  const split = useMemo(() => splitTitles(picked.map((p) => p.title)), [picked]);
  const asVariants = oneProduct && picked.length > 1;
  const productName = name ?? split.common;
  const variantName = (p: Found, i: number) => vnames[p.path] ?? (split.parts[i] || p.title);
  const has = (path: string) => picked.some((p) => p.path === path);
  const toggle = (f: Found) => (setName(null), setPicked((cur) => (cur.some((p) => p.path === f.path) ? cur.filter((p) => p.path !== f.path) : [...cur, f].slice(0, 20))));

  async function search() {
    if (q.trim().length < 2) return;
    setBusy("Ищем у поставщика…");
    setError("");
    const r = await supplierSearchAction(q);
    setBusy("");
    if (r.error) return setError(r.error);
    setList(r.list ?? []);
  }

  /** Ссылки или коды, вставленные руками: по одной в строке */
  async function addRefs() {
    const lines = refs.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
    if (!lines.length) return;
    setError("");
    const add: Found[] = [];
    for (const [i, line] of lines.entries()) {
      setBusy(`Открываем карточки… ${i + 1} из ${lines.length}`);
      const r = await supplierGrabAction(line, 0);
      if (r.item) add.push({ path: r.item.path, title: r.item.title });
      else setError(`«${line}»: ${r.error ?? "не нашли"}`);
    }
    setBusy("");
    setName(null);
    setPicked((cur) => [...cur, ...add.filter((a) => !cur.some((p) => p.path === a.path))].slice(0, 20));
    if (add.length === lines.length) setRefs("");
  }

  async function create() {
    setError("");
    const items: GrabbedItem[] = [];
    for (const [i, p] of picked.entries()) {
      setBusy(`Берём фото и характеристики… ${i + 1} из ${picked.length}`);
      // Вариантам — по три фото, отдельному товару — до шести
      const r = await supplierGrabAction(p.path, asVariants ? 3 : 6);
      if (!r.item) {
        setBusy("");
        return setError(`«${p.title}»: ${r.error ?? "не получилось"}`);
      }
      items.push({ ...r.item, variant: asVariants ? variantName(p, i).trim() : undefined });
    }
    const groups = asVariants ? [{ name: productName.trim(), items }] : items.map((it) => ({ name: it.title.replace(/\s*1\s*шт\.?$/i, ""), items: [it] }));
    const done: Created[] = [];
    for (const [i, g] of groups.entries()) {
      setBusy(`Создаём… ${i + 1} из ${groups.length}`);
      const r = await supplierCreateAction({ name: g.name, categoryId: categoryId || null, items: g.items });
      if (!r.id) {
        setBusy("");
        setCreated((c) => [...done, ...c]);
        return setError(`«${g.name}»: ${r.error ?? "не получилось"}`);
      }
      done.push({ id: r.id, name: g.name, price: r.price ?? 0, variants: g.items.length });
    }
    setBusy("");
    setCreated((c) => [...done, ...c]);
    setPicked([]);
    setVnames({});
    setName(null);
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      {created.length > 0 && (
        <div className="form-ok stack" style={{ gap: 6 }}>
          <b>Создано черновиков: {created.length}</b>
          {created.map((c) => (
            <div key={c.id} className="row" style={{ gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>
                {c.name}
                <span className="small">
                  {" "}
                  · {c.variants > 1 ? `вариантов: ${c.variants} · ` : ""}
                  {c.price ? `цена ${c.variants > 1 ? "от " : ""}${rub(c.price)} (рекомендованная)` : "цену впишите сами"}
                </span>
              </span>
              <Link href={`/admin/catalog/product/${c.id}`} className="btn btn--sm btn--line">
                Открыть карточку
              </Link>
            </div>
          ))}
          <span className="small">Товары пока скрыты от покупателей. Проверьте цену, впишите остаток и опубликуйте.</span>
        </div>
      )}

      <div className="panel stack" style={{ gap: 10 }}>
        <b>1. Найдите товар у поставщика</b>
        <form
          className="row"
          style={{ gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input className="input" style={{ flex: "1 1 240px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: Kamui Black" aria-label="Что искать у поставщика" />
          <button className="btn btn--gold btn--sm" disabled={!!busy || q.trim().length < 2}>
            Найти
          </button>
        </form>
        <span className="muted small">Поиск у них — по куску названия подряд: «Kamui Black» найдёт, «Black Kamui» — нет.</span>
        {list && list.length === 0 && <span className="muted">Ничего не нашлось — попробуйте короче: бренд или модель.</span>}
        {list && list.length > 0 && (
          <div className="stack" style={{ gap: 2, maxHeight: 360, overflow: "auto" }}>
            {list.map((f) => (
              <label key={f.path} className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={has(f.path)} onChange={() => toggle(f)} />
                <span>{f.title}</span>
              </label>
            ))}
          </div>
        )}
        <details>
          <summary className="small">Или вставьте ссылки с fortu.ru или коды товаров</summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <textarea className="textarea" value={refs} onChange={(e) => setRefs(e.target.value)} style={{ minHeight: 80, paddingTop: 12 }} placeholder={"https://fortu.ru/product/…\n01851"} aria-label="Ссылки или коды, по одной в строке" />
            <button type="button" className="btn btn--line btn--sm" style={{ alignSelf: "flex-start" }} disabled={!!busy || !refs.trim()} onClick={addRefs}>
              Добавить
            </button>
          </div>
        </details>
      </div>

      {picked.length > 0 && (
        <div className="panel stack" style={{ gap: 10 }}>
          <b>2. Что создаём · выбрано {picked.length}</b>
          {picked.length > 1 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="group" aria-label="Как создать">
              <button type="button" className={`btn btn--sm ${oneProduct ? "btn--gold" : "btn--line"}`} onClick={() => setOneProduct(true)}>
                Один товар с {picked.length} вариантами
              </button>
              <button type="button" className={`btn btn--sm ${oneProduct ? "btn--line" : "btn--gold"}`} onClick={() => setOneProduct(false)}>
                {picked.length} отдельных товаров
              </button>
            </div>
          )}
          {asVariants && (
            <label className="field" style={{ margin: 0 }}>
              Название товара
              <input className="input" value={productName} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {picked.map((p, i) => (
            <div key={p.path} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {asVariants && (
                <input className="input" style={{ flex: "0 1 220px", minHeight: 40 }} value={variantName(p, i)} onChange={(e) => setVnames({ ...vnames, [p.path]: e.target.value })} aria-label={`Название варианта: ${p.title}`} />
              )}
              <span className="small" style={{ flex: "1 1 240px" }}>
                {p.title}
              </span>
              <button type="button" className="linklike small" onClick={() => toggle(p)} aria-label={`Убрать: ${p.title}`}>
                убрать
              </button>
            </div>
          ))}
          <label className="field" style={{ margin: 0, maxWidth: 360 }}>
            Категория
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— выберите позже —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="muted small">От категории зависит, какие характеристики заполнятся (у наклеек — диаметр и жёсткость, у сукна — ширина и состав), и артикул.</span>
          <button type="button" className="btn btn--gold" style={{ alignSelf: "flex-start" }} disabled={!!busy || (asVariants && productName.trim().length < 2)} onClick={create}>
            {asVariants ? "Создать товар с вариантами" : picked.length > 1 ? `Создать ${picked.length} товаров` : "Создать товар"}
          </button>
        </div>
      )}
      {busy && <div role="status">{busy}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
