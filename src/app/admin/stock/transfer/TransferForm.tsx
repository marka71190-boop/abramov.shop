"use client";
/**
 * Перемещение списком: всё, что есть в месте «Откуда», — одним списком с кнопками − / +.
 * Набрали сразу всё, что везёте (с телефона, на складе), проверили и переместили одной кнопкой.
 * Сканер (пистолет или камера) тоже добавляет +1. Набранное не теряется при перезагрузке страницы.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { PickOption } from "@/components/admin/VariantPicker";
import { BarcodeScanner, signal } from "@/components/pos/BarcodeScanner";
import { useScanWedge } from "@/components/pos/useScanWedge";
import { codeMatches } from "@/lib/code-match";
import { sized } from "@/lib/img";
import { transferAction, type MoveResult } from "../actions";

type Loc = { id: string; title: string }; // id "" — склад
type There = Record<string, { qty: number; norm: number | null }>;

const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е");

export function TransferForm({ locations, from, to, options, there }: { locations: Loc[]; from: string; to: string; options: PickOption[]; there: There }) {
  const router = useRouter();
  const draftKey = `transfer:${from || "wh"}:${to || "wh"}`;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [review, setReview] = useState(false);
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const go = (f: string, t: string) => router.replace(`/admin/stock/transfer?from=${f || "wh"}&to=${t || "wh"}`);
  const fromTitle = locations.find((l) => l.id === from)?.title ?? "Склад";
  const toTitle = locations.find((l) => l.id === to)?.title ?? "Склад";

  const avail = useMemo(() => options.filter((o) => o.stock > 0), [options]);
  const byId = useMemo(() => new Map(avail.map((o) => [o.id, o])), [avail]);
  const cats = useMemo(() => [...new Set(avail.map((o) => o.category ?? "Без категории"))].sort((a, b) => a.localeCompare(b, "ru")), [avail]);

  // Черновик — в браузере этого телефона: случайно обновили страницу — набранное на месте
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "{}") as Record<string, number>;
      const ok = Object.fromEntries(Object.entries(saved).filter(([id, n]) => byId.has(id) && n > 0).map(([id, n]) => [id, Math.min(n, byId.get(id)!.stock)]));
      if (Object.keys(ok).length) setQty(ok);
    } catch {}
  }, [draftKey, byId]);
  useEffect(() => {
    try {
      if (Object.keys(qty).length) localStorage.setItem(draftKey, JSON.stringify(qty));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [qty, draftKey]);

  const set = (id: string, n: number) =>
    setQty((m) => {
      const o = byId.get(id);
      if (!o) return m;
      const v = Math.max(0, Math.min(o.stock, Math.trunc(n) || 0));
      const next = { ...m };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });

  const onCode = (code: string) => {
    const o = avail.find((x) => codeMatches(x, code));
    if (!o) {
      setScanMsg({ text: `Нет в месте «${fromTitle}» товара с кодом ${code}`, ok: false });
      return null;
    }
    const cur = qty[o.id] ?? 0;
    if (cur >= o.stock) {
      setScanMsg({ text: `${o.name}: больше нет — всего ${o.stock} шт`, ok: false });
      return null;
    }
    set(o.id, cur + 1);
    setScanMsg({ text: `+ ${o.name} — ${cur + 1} шт`, ok: true });
    return o.name;
  };
  useScanWedge((code) => signal(!!onCode(code)), !scan && from !== to);

  const chosen = avail.filter((o) => qty[o.id]);
  const units = chosen.reduce((a, o) => a + qty[o.id], 0);
  const needle = norm(q.trim());
  const shown = avail.filter(
    (o) =>
      (!onlyPicked || qty[o.id]) &&
      (!cat || (o.category ?? "Без категории") === cat) &&
      (!needle || norm(`${o.name} ${o.sku ?? ""} ${o.barcode ?? ""}`).includes(needle)),
  );
  // Клуб с нормами: «добрать до нормы» — сколько не хватает, но не больше, чем есть
  const short = to
    ? avail.filter((o) => {
        const t = there[o.id];
        return t?.norm && t.qty < t.norm;
      })
    : [];

  function submit() {
    setRes({});
    const lines = chosen.map((o) => ({ variantId: o.id, qty: qty[o.id] }));
    start(async () => {
      const r = await transferAction({ from: from || null, to: to || null, note: note.trim() || undefined, lines });
      setRes(r);
      if (r.ok) {
        setQty({});
        setNote("");
        setReview(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="form-grid">
        <label className="field">
          Откуда
          <select className="input" value={from} onChange={(e) => (setQty({}), go(e.target.value, to === e.target.value ? from : to))}>
            {locations.map((l) => (
              <option key={l.id || "wh"} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Куда
          <select className="input" value={to} onChange={(e) => go(from === e.target.value ? to : from, e.target.value)}>
            {locations.map((l) => (
              <option key={l.id || "wh"} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {res.ok && <div className="form-ok">{res.ok}</div>}

      {from === to ? (
        <div className="form-error">Откуда и куда — одно место. Выберите другое.</div>
      ) : avail.length === 0 ? (
        <div className="notice notice--muted">В месте «{fromTitle}» нет товара в наличии.</div>
      ) : (
        <>
          {scan && <BarcodeScanner onCode={onCode} onClose={() => setScan(false)} />}
          <div className="pos-find">
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар" aria-label="Поиск товара" />
            {!scan && (
              <button type="button" className="btn btn--line pos-scan-btn" onClick={() => setScan(true)} aria-label="Сканировать штрихкод камерой">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8" />
                </svg>
                <span>Сканер</span>
              </button>
            )}
          </div>
          {scanMsg && !scan && (
            <div className={scanMsg.ok ? "form-ok" : "form-error"} role="status">
              {scanMsg.text}
            </div>
          )}

          <div className="tr-chips" role="group" aria-label="Категория">
            <button type="button" className={`chip${!cat && !onlyPicked ? " is-on" : ""}`} onClick={() => (setCat(""), setOnlyPicked(false))}>
              Все · {avail.length}
            </button>
            {chosen.length > 0 && (
              <button type="button" className={`chip${onlyPicked ? " is-on" : ""}`} onClick={() => (setOnlyPicked(!onlyPicked), setCat(""))}>
                Выбрано · {chosen.length}
              </button>
            )}
            {cats.length > 1 &&
              cats.map((c) => (
                <button key={c} type="button" className={`chip${cat === c ? " is-on" : ""}`} onClick={() => (setCat(cat === c ? "" : c), setOnlyPicked(false))}>
                  {c}
                </button>
              ))}
          </div>

          {short.length > 0 && (
            <button
              type="button"
              className="btn btn--line btn--sm"
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                for (const o of short) set(o.id, Math.max(qty[o.id] ?? 0, there[o.id].norm! - there[o.id].qty));
                setScanMsg({ text: `Добавили до нормы клуба: ${short.length} поз.`, ok: true });
              }}
            >
              Добрать до нормы клуба ({short.length} поз.)
            </button>
          )}

          {shown.length === 0 ? (
            <p className="muted">Ничего не нашли.</p>
          ) : (
            <ul className="tr-list">
              {shown.map((o) => {
                const n = qty[o.id] ?? 0;
                const t = there[o.id];
                return (
                  <li key={o.id} className={n ? "is-on" : undefined}>
                    {o.image ? <img src={sized(o.image, 160)} alt="" loading="lazy" /> : <span className="tr-list__noimg" aria-hidden />}
                    <div className="tr-list__info">
                      <div className="tr-list__name">{o.name}</div>
                      <div className="muted small">
                        есть {o.stock}
                        {t ? ` · ${to ? "в клубе" : "на складе"} ${t.qty}${t.norm ? ` из ${t.norm}` : ""}` : ""}
                      </div>
                    </div>
                    <div className="tr-step">
                      {n > 0 && (
                        <button type="button" className="btn btn--line" onClick={() => set(o.id, n - 1)} aria-label={`Меньше: ${o.name}`}>
                          −
                        </button>
                      )}
                      {n > 0 && (
                        <input
                          className="input"
                          inputMode="numeric"
                          value={String(n)}
                          onChange={(e) => set(o.id, Number(e.target.value.replace(/\D/g, "")))}
                          onFocus={(e) => e.target.select()}
                          aria-label={`Сколько везём: ${o.name}`}
                        />
                      )}
                      <button type="button" className={`btn ${n ? "btn--line" : "btn--gold"}`} disabled={n >= o.stock} onClick={() => set(o.id, n + 1)} aria-label={`Больше: ${o.name}`}>
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {chosen.length > 0 && (
            <div className="tr-bar">
              {review ? (
                <div className="tr-bar__review stack" style={{ gap: 8 }}>
                  <b>
                    {fromTitle} → {toTitle} · {units} шт
                  </b>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18, maxHeight: "40vh", overflow: "auto" }}>
                    {chosen.map((o) => (
                      <li key={o.id}>
                        {o.name} — <b>{qty[o.id]} шт</b>
                      </li>
                    ))}
                  </ul>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Комментарий: кто везёт (необязательно)" />
                  {res.error && <div className="form-error">{res.error}</div>}
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn--gold" style={{ flex: 1 }} disabled={pending} onClick={submit}>
                      {pending ? "Перемещаем…" : "Переместить"}
                    </button>
                    <button type="button" className="btn btn--line" disabled={pending} onClick={() => setReview(false)}>
                      Назад
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span style={{ flex: 1 }}>
                    <b>
                      {chosen.length} поз. · {units} шт
                    </b>
                    <span className="muted small"> → {toTitle}</span>
                  </span>
                  <button type="button" className="linklike small" onClick={() => setQty({})}>
                    Сбросить
                  </button>
                  <button type="button" className="btn btn--gold" onClick={() => (setRes({}), setReview(true))}>
                    Дальше
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
