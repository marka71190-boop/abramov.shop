"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveBulk, type BulkResult } from "./actions";

export type Row = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  oldPrice: number | null;
  categoryId: string | null;
  hidden: boolean;
  image: string | null;
  variants: { id: string; name: string; sku: string | null; price: number | null; stock: number; active: boolean }[];
};

const rubStr = (k: number | null) => (k == null ? "" : String(k / 100));
const toKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);

export function PriceTable({ rows, categories }: { rows: Row[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState("");
  const [round, setRound] = useState("10");
  const [res, setRes] = useState<BulkResult>({});
  const [pending, start] = useTransition();

  // Исходные значения клеток — с ними сравниваем, что изменилось
  const orig = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      m[`p:${r.id}:price`] = rubStr(r.price);
      m[`p:${r.id}:old`] = rubStr(r.oldPrice);
      for (const v of r.variants) {
        m[`v:${v.id}:price`] = rubStr(v.price);
        m[`v:${v.id}:stock`] = String(v.stock);
      }
    }
    return m;
  }, [rows]);
  const val = (k: string) => edits[k] ?? orig[k] ?? "";
  const dirty = (k: string) => k in edits && edits[k].trim() !== (orig[k] ?? "");
  const set = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));
  const changed = Object.keys(edits).filter(dirty);
  const rowChanged = (r: Row) => changed.some((k) => k.includes(r.id) || r.variants.some((v) => k.includes(v.id)));

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!cat || r.categoryId === cat) &&
      (!needle || `${r.name} ${r.sku ?? ""} ${r.variants.map((v) => `${v.name} ${v.sku ?? ""}`).join(" ")}`.toLowerCase().includes(needle)) &&
      (!onlyChanged || rowChanged(r)),
  );
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  /** ±% к цене отмеченных товаров (и к своим ценам их вариантов), с округлением */
  function applyPct() {
    const p = Number(pct.replace(",", "."));
    if (!Number.isFinite(p) || p === 0 || !picked.size) return;
    const step = Number(round) * 100 || 100;
    const calc = (kop: number) => String(Math.max(1, Math.round((kop * (1 + p / 100)) / step) * step) / 100);
    const next = { ...edits };
    for (const r of rows) {
      if (!picked.has(r.id)) continue;
      const cur = toKop(val(`p:${r.id}:price`));
      if (cur > 0) next[`p:${r.id}:price`] = calc(cur);
      for (const v of r.variants) {
        const own = val(`v:${v.id}:price`);
        if (own.trim()) next[`v:${v.id}:price`] = calc(toKop(own));
      }
    }
    setEdits(next);
  }

  function save() {
    setRes({});
    const products: { id: string; price?: number; oldPrice?: number | null }[] = [];
    const variants: { id: string; price?: number | null; stock?: number; stockWas?: number }[] = [];
    for (const r of rows) {
      const pr: (typeof products)[number] = { id: r.id };
      if (dirty(`p:${r.id}:price`)) pr.price = toKop(val(`p:${r.id}:price`));
      if (dirty(`p:${r.id}:old`)) pr.oldPrice = val(`p:${r.id}:old`).trim() ? toKop(val(`p:${r.id}:old`)) : null;
      if (Object.keys(pr).length > 1) products.push(pr);
      for (const v of r.variants) {
        const vr: (typeof variants)[number] = { id: v.id };
        if (dirty(`v:${v.id}:price`)) vr.price = val(`v:${v.id}:price`).trim() ? toKop(val(`v:${v.id}:price`)) : null;
        if (dirty(`v:${v.id}:stock`)) {
          vr.stock = Math.max(0, Math.trunc(Number(val(`v:${v.id}:stock`)) || 0));
          vr.stockWas = v.stock;
        }
        if (Object.keys(vr).length > 1) variants.push(vr);
      }
    }
    if ([...products, ...variants].some((x) => ("price" in x && x.price != null && !(x.price >= 100)) || ("oldPrice" in x && x.oldPrice != null && !(x.oldPrice >= 100))))
      return setRes({ error: "Цена — в рублях, не меньше 1 ₽" });
    start(async () => {
      const r = await saveBulk({ products, variants });
      setRes(r);
      if (r.ok) {
        setEdits({});
        router.refresh();
      }
    });
  }

  const cell = (k: string, opts: { placeholder?: string; step?: string; w?: number } = {}) => (
    <input
      className={`input bulk-input${dirty(k) ? " is-dirty" : ""}`}
      inputMode="decimal"
      value={val(k)}
      placeholder={opts.placeholder}
      onChange={(e) => set(k, e.target.value)}
      style={{ width: opts.w ?? 110 }}
      aria-label={k.endsWith(":stock") ? "Остаток" : k.endsWith(":old") ? "Старая цена" : "Цена"}
    />
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}>
          Поиск
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, вариант или артикул" />
        </label>
        <label className="field" style={{ margin: 0 }}>
          Категория
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Все</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check" style={{ minHeight: 48 }}>
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          <span>Только изменённые</span>
        </label>
      </div>

      <div className="bulk-tools row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span className="small">Отмечено: {picked.size}</span>
        <span className="small muted">Цену</span>
        <input className="input bulk-input" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="+10 или −5" style={{ width: 110 }} aria-label="Изменить цену на процент" />
        <span className="small muted">%, округлить до</span>
        <select className="select" value={round} onChange={(e) => setRound(e.target.value)} style={{ width: "auto", minHeight: 40 }} aria-label="Округление">
          <option value="1">1 ₽</option>
          <option value="10">10 ₽</option>
          <option value="50">50 ₽</option>
          <option value="100">100 ₽</option>
        </select>
        <button type="button" className="btn btn--line btn--sm" disabled={!picked.size || !pct.trim()} onClick={applyPct}>
          Применить к отмеченным
        </button>
      </div>

      <div className="table-wrap">
        <table className="table bulk-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  aria-label="Отметить все"
                  onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...shown.map((r) => r.id)]) : new Set([...picked].filter((id) => !shown.some((r) => r.id === id))))}
                />
              </th>
              <th>Товар</th>
              <th>Цена, ₽</th>
              <th>Старая, ₽</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const multi = r.variants.length > 1;
              const one = r.variants[0];
              return [
                <tr key={r.id} className={rowChanged(r) ? "is-changed" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={picked.has(r.id)}
                      aria-label={`Отметить ${r.name}`}
                      onChange={(e) => {
                        const n = new Set(picked);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        setPicked(n);
                      }}
                    />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10, flexWrap: "nowrap", alignItems: "center" }}>
                      {r.image ? <img src={r.image} alt="" className="admin-thumb" loading="lazy" /> : <span className="admin-thumb" />}
                      <div>
                        <Link href={`/admin/catalog/product/${r.id}`}>{r.name}</Link>
                        <div className="muted small">
                          {[r.sku, r.hidden ? "не опубликован" : null, multi ? `${r.variants.length} вариантов` : null].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{cell(`p:${r.id}:price`)}</td>
                  <td>{cell(`p:${r.id}:old`, { placeholder: "—" })}</td>
                  <td>{!multi && one ? cell(`v:${one.id}:stock`, { w: 90 }) : <span className="muted small">по вариантам</span>}</td>
                </tr>,
                ...(multi
                  ? r.variants.map((v) => (
                      <tr key={v.id} className="bulk-variant">
                        <td />
                        <td className="small">
                          {v.name}
                          {v.sku && <span className="muted"> · {v.sku}</span>}
                          {!v.active && <span className="muted"> · не в продаже</span>}
                        </td>
                        <td>{cell(`v:${v.id}:price`, { placeholder: val(`p:${r.id}:price`) || "как у товара" })}</td>
                        <td />
                        <td>{cell(`v:${v.id}:stock`, { w: 90 })}</td>
                      </tr>
                    ))
                  : []),
              ];
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Ничего не нашли
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(changed.length > 0 || res.ok || res.error) && (
        <div className="bulk-save">
          <span className="small">
            {changed.length ? `Изменений: ${changed.length}` : ""}
            {res.ok && <span className="form-ok small"> {res.ok}</span>}
            {res.error && <span className="form-error small"> {res.error}</span>}
            {res.conflicts && <span className="form-error small"> Остаток не сохранён — пока таблица была открыта, товар купили: {res.conflicts.join(", ")}. Проверьте и введите заново.</span>}
          </span>
          {changed.length > 0 && (
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => setEdits({})}>
                Отменить
              </button>
              <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={save}>
                {pending ? "Сохраняем…" : "Сохранить"}
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
