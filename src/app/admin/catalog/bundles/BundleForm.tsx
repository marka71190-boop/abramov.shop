"use client";
import { useActionState, useState, useTransition } from "react";
import { rub } from "@/lib/format";
import { deleteBundle, saveBundle } from "./actions";

interface B {
  id: string;
  name: string;
  note: string;
  percent: number;
  productIds: string[];
  isActive: boolean;
  sortOrder: number;
}
type P = { id: string; name: string; sku: string | null; price: number; visibility: string };

export function BundleForm({ bundle, products, live }: { bundle: B | null; products: P[]; live: boolean }) {
  const [state, action, pending] = useActionState(saveBundle, {});
  const [ids, setIds] = useState<string[]>(bundle?.productIds ?? []);
  const [percent, setPercent] = useState(bundle?.percent ?? 10);
  const [q, setQ] = useState("");
  const [deleting, startDelete] = useTransition();
  const byId = new Map(products.map((p) => [p.id, p]));
  const needle = q.trim().toLowerCase();
  const found = needle ? products.filter((p) => !ids.includes(p.id) && (p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle))).slice(0, 8) : [];
  const full = ids.reduce((a, id) => a + (byId.get(id)?.price ?? 0), 0);
  const price = full - Math.floor((full * (Number(percent) || 0)) / 100 / 100) * 100;

  return (
    <form action={action} className="panel stack" style={{ gap: 10 }}>
      {bundle && <input type="hidden" name="id" value={bundle.id} />}
      <input type="hidden" name="productIds" value={JSON.stringify(ids)} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{bundle ? bundle.name : "Новый комплект"}</b>
        {bundle && <span className={`pill ${live ? "pill--ok" : ""}`}>{live ? "виден покупателям" : bundle.isActive ? "не виден: товар скрыт или закончился" : "выключен"}</span>}
      </div>
      <div className="form-grid">
        <label className="field">
          Название
          <input className="input" name="name" defaultValue={bundle?.name ?? ""} required maxLength={120} placeholder="Набор игрока: кий + чехол + мел" />
        </label>
        <label className="field">
          Скидка, %
          <input className="input" name="percent" type="number" min={1} max={50} value={percent} onChange={(e) => setPercent(Number(e.target.value))} required />
        </label>
        <label className="field">
          Порядок
          <input className="input" name="sortOrder" type="number" defaultValue={bundle?.sortOrder ?? 0} />
        </label>
      </div>
      <label className="field">
        Подпись (необязательно)
        <input className="input" name="note" defaultValue={bundle?.note ?? ""} maxLength={300} placeholder="Всё, что нужно, чтобы начать играть" />
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small muted">Товары комплекта — от 2 до 6:</span>
        {ids.map((id) => {
          const p = byId.get(id);
          return (
            <div key={id} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>
                {p?.name ?? "Удалённый товар"} {p && <span className="muted small">· {rub(p.price)}{p.visibility !== "PUBLISHED" ? " · не опубликован" : ""}</span>}
              </span>
              <button type="button" className="btn btn--line btn--sm" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label="Убрать">
                ×
              </button>
            </div>
          );
        })}
        {ids.length < 6 && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добавить товар: название или артикул" />}
        {found.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn btn--line btn--sm"
            style={{ justifyContent: "flex-start" }}
            onClick={() => {
              setIds([...ids, p.id]);
              setQ("");
            }}
          >
            + {p.name} · {rub(p.price)}
          </button>
        ))}
        {ids.length >= 2 && (
          <div className="small">
            Комплект: <s className="muted">{rub(full)}</s> → <b>{rub(price)}</b> <span className="muted">(по базовой цене товаров)</span>
          </div>
        )}
      </div>
      <label className="check">
        <input type="checkbox" name="isActive" defaultChecked={bundle?.isActive ?? true} />
        <span>Включён</span>
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {bundle ? "Сохранить" : "Создать комплект"}
        </button>
        {bundle && (
          <button
            type="button"
            className="btn btn--line btn--sm"
            disabled={deleting}
            onClick={() => {
              if (confirm(`Удалить комплект «${bundle.name}»?`)) startDelete(() => deleteBundle(bundle.id));
            }}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
