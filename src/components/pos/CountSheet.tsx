"use client";
/**
 * Лист ревизии: сканируем камерой (каждый штрихкод +1 шт) или находим по названию, правим количество.
 * Сохраняется на сервере сам через пару секунд после каждого изменения.
 * blind — кассир не видит, сколько должно быть по учёту (честный пересчёт).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { countCancelAction, countSaveAction, countSubmitAction } from "@/app/admin/stock/count/actions";
import { VariantPicker, type PickOption } from "@/components/admin/VariantPicker";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";

const norm = (t: string) => t.trim().toLowerCase().replace(/ё/g, "е");

export function CountSheet({
  id,
  options,
  initial,
  blind,
  canSubmit,
  backHref,
}: {
  id: string;
  options: PickOption[];
  initial: Record<string, number>;
  blind: boolean;
  /** Кассир отправляет менеджеру; менеджер в админке проводит сам (кнопка ниже листа) */
  canSubmit: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>(initial);
  const [order, setOrder] = useState<string[]>(() => Object.keys(initial));
  const [scan, setScan] = useState(false);
  const [saved, setSaved] = useState<"ok" | "saving" | "error">("ok");
  const [full, setFull] = useState(true);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const first = useRef(true);

  // Автосохранение: через 1,5 с после последнего изменения
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = setTimeout(async () => {
      const r = await countSaveAction(id, counts).catch(() => ({ error: "нет связи" }));
      setSaved(r.error ? "error" : "ok");
      if (r.error && /отправлена|закрыта/.test(r.error)) setMsg({ error: r.error });
    }, 1500);
    return () => clearTimeout(t);
  }, [counts, id]);

  const bump = (vid: string, by: number) => {
    setCounts((c) => {
      const n = Math.max(0, (c[vid] ?? 0) + by);
      return { ...c, [vid]: n };
    });
    setOrder((o) => [vid, ...o.filter((x) => x !== vid)]);
  };
  const setQty = (vid: string, v: string) => {
    const n = Math.max(0, Math.min(100_000, Math.trunc(Number(v.replace(/\D/g, "")) || 0)));
    setCounts((c) => ({ ...c, [vid]: n }));
  };
  const remove = (vid: string) => {
    setCounts((c) => {
      const next = { ...c };
      delete next[vid];
      return next;
    });
    setOrder((o) => o.filter((x) => x !== vid));
  };

  const onCode = (code: string) => {
    const o = options.find((x) => x.sku && norm(x.sku) === norm(code));
    if (!o) return null;
    bump(o.id, 1);
    return `${o.name} — ${(counts[o.id] ?? 0) + 1} шт`;
  };

  const total = Object.values(counts).reduce((a, x) => a + x, 0);
  const lines = order.filter((vid) => vid in counts);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {scan && <BarcodeScanner onCode={onCode} onClose={() => setScan(false)} />}
      <div className="pos-find">
        <VariantPicker
          options={options}
          onPick={(o) => bump(o.id, 1)}
          placeholder="Найти товар: название или артикул"
          hint={blind ? () => "" : undefined}
        />
        {!scan && (
          <button type="button" className="btn btn--line pos-scan-btn" onClick={() => setScan(true)} aria-label="Сканировать штрихкод камерой">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8" />
            </svg>
            <span>Сканер</span>
          </button>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Каждое сканирование — +1 шт. Одинаковых товаров много — отсканируйте один и впишите количество.
      </p>

      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <b>
          Насчитано: {total} шт · {lines.length} поз.
        </b>
        <span className={`small ${saved === "error" ? "form-error" : "muted"}`} role="status" style={{ padding: 0, background: "none", border: 0 }}>
          {saved === "saving" ? "Сохраняем…" : saved === "error" ? "Не сохранилось — проверьте интернет" : "Сохранено"}
        </span>
      </div>

      {lines.length === 0 ? (
        <div className="notice notice--muted">Пока пусто. Начните со сканера или найдите товар по названию.</div>
      ) : (
        <ul className="count-list">
          {lines.map((vid) => {
            const o = byId.get(vid);
            return (
              <li key={vid}>
                <span className="count-list__name">
                  {o?.name ?? "Товар снят с продажи"}
                  {o?.sku && <span className="muted small"> · {o.sku}</span>}
                </span>
                <span className="count-list__qty">
                  <button type="button" className="btn btn--line btn--sm" onClick={() => bump(vid, -1)} aria-label="Минус один">
                    −
                  </button>
                  <input className="input" inputMode="numeric" value={String(counts[vid] ?? 0)} onChange={(e) => setQty(vid, e.target.value)} aria-label="Количество" />
                  <button type="button" className="btn btn--line btn--sm" onClick={() => bump(vid, 1)} aria-label="Плюс один">
                    +
                  </button>
                  <button type="button" className="linklike small" onClick={() => remove(vid)} aria-label="Убрать строку">
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {canSubmit && (
        <div className="panel stack" style={{ gap: 10 }}>
          <label className="check">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
            <span>Посчитал(а) всё в клубе — чего нет в списке, того нет на полке</span>
          </label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Комментарий для менеджера (необязательно)" />
          {msg.error && <div className="form-error">{msg.error}</div>}
          {msg.ok ? (
            <div className="form-ok">{msg.ok}</div>
          ) : (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--gold"
                disabled={pending || total === 0}
                onClick={() =>
                  start(async () => {
                    const r = await countSubmitAction(id, counts, full, note);
                    setMsg(r);
                    if (r.ok) router.refresh();
                  })
                }
              >
                {pending ? "Отправляем…" : "Закончить и отправить менеджеру"}
              </button>
              <button
                type="button"
                className="btn btn--line"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (!window.confirm("Отменить ревизию? Насчитанное пропадёт.")) return;
                    await countCancelAction(id);
                    router.push(backHref);
                  })
                }
              >
                Отменить ревизию
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
