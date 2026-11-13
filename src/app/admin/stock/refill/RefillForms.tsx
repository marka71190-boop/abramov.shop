"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ClubLine } from "@/lib/club-low";
import { normsAction, refillDigestAction, transferAction, type MoveResult } from "../actions";

/** «Прислать список сейчас» — тот же недельный список, что приходит по понедельникам */
export function DigestButton() {
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  return (
    <span className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn--sm btn--line" disabled={pending} onClick={() => start(async () => setRes(await refillDigestAction()))}>
        {pending ? "Отправляем…" : "Прислать список сейчас"}
      </button>
      {res.ok && <span className="small">{res.ok}</span>}
    </span>
  );
}

/** Заканчивается в клубе: отметить, поправить количество и привезти со склада одной кнопкой */
export function RefillForm({ clubId, lines, readonly, empty }: { clubId: string; lines: ClubLine[]; readonly: boolean; empty: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.variantId, l.suggest > 0 ? String(l.suggest) : ""])));
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.map((l) => [l.variantId, l.suggest > 0])));
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const chosen = lines.filter((l) => on[l.variantId]);
  const [labelsHref, setLabelsHref] = useState("");
  const packed = (list: { variantId: string; qty: number }[]) => encodeURIComponent(list.map((l) => `${l.variantId}:${l.qty}`).join(","));
  // Лист сборки — на отмеченное, с теми количествами, что в полях
  const pickHref = `/print/pick?club=${clubId}&i=${packed(chosen.map((l) => ({ variantId: l.variantId, qty: Math.trunc(Number(qty[l.variantId])) || 0 })).filter((l) => l.qty > 0))}`;

  function submit() {
    setRes({});
    const out: { variantId: string; qty: number }[] = [];
    for (const l of chosen) {
      const q = Math.trunc(Number(qty[l.variantId]));
      if (!(q >= 1)) return setRes({ error: `«${l.name}»: проверьте количество` });
      if (q > l.warehouse) return setRes({ error: `«${l.name}»: на складе только ${l.warehouse} шт` });
      out.push({ variantId: l.variantId, qty: q });
    }
    if (!out.length) return setRes({ error: "Отметьте, что привезти" });
    start(async () => {
      const r = await transferAction({ from: null, to: clubId, note: "Пополнение по «заканчивается в клубе»", lines: out });
      setRes(r);
      setLabelsHref(r.ok ? `/admin/stock/labels?club=${clubId}&i=${packed(out)}` : "");
      if (r.ok) router.refresh();
    });
  }

  const done = res.ok && (
    <div className="form-ok row" style={{ gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <span>{res.ok}</span>
      {labelsHref && (
        <Link href={labelsHref} className="btn btn--sm btn--line">
          🏷 Этикетки на привезённое
        </Link>
      )}
    </div>
  );
  if (!lines.length)
    return (
      <div className="stack" style={{ gap: 10 }}>
        {done}
        <p className="muted" style={{ margin: 0 }}>
          {empty}
        </p>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>В клубе</th>
              <th style={{ textAlign: "right" }}>Норма</th>
              <th style={{ textAlign: "right" }}>На складе</th>
              <th>Привезти</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.variantId}>
                <td>
                  <input type="checkbox" checked={!!on[l.variantId]} disabled={l.warehouse <= 0} onChange={(e) => setOn((o) => ({ ...o, [l.variantId]: e.target.checked }))} aria-label={`Привезти «${l.name}»`} />
                </td>
                <td>
                  {l.name}
                  <div className="muted small">{[l.sku, l.bin && `ячейка ${l.bin}`].filter(Boolean).join(" · ")}</div>
                </td>
                <td style={{ textAlign: "right" }} className={l.qty <= 0 ? "is-loss" : undefined}>
                  {l.qty}
                </td>
                <td style={{ textAlign: "right" }}>{l.minQty ?? "—"}</td>
                <td style={{ textAlign: "right" }} className={l.warehouse <= 0 ? "muted" : undefined}>
                  {l.warehouse > 0 ? l.warehouse : "нет"}
                </td>
                <td>
                  <input
                    className="input"
                    inputMode="numeric"
                    style={{ width: 80 }}
                    value={qty[l.variantId] ?? ""}
                    disabled={!on[l.variantId]}
                    onChange={(e) => setQty((q) => ({ ...q, [l.variantId]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    aria-label="Сколько привезти"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {res.error && <div className="form-error">{res.error}</div>}
      {done}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--line" disabled={!chosen.length} onClick={() => window.open(pickHref, "_blank", "noopener")}>
          🖨 Лист сборки
        </button>
        <button type="button" className="btn btn--gold" disabled={pending || readonly || !chosen.length} onClick={submit}>
          {pending ? "Перемещаем…" : `Переместить со склада (${chosen.length} поз.)`}
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Порядок: напечатали лист сборки → собрали по ячейкам → «Переместить» → этикетки на привезённое.
      </p>
    </div>
  );
}

/** Нормы: сколько держать в клубе. Напомним, когда останется половина */
export function NormsForm({ clubId, lines, readonly }: { clubId: string; lines: ClubLine[]; readonly: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.variantId, l.minQty ? String(l.minQty) : ""])));
  const [q, setQ] = useState("");
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const needle = q.trim().toLowerCase();
  const shown = needle ? lines.filter((l) => `${l.name} ${l.sku ?? ""}`.toLowerCase().includes(needle)) : lines;

  function save() {
    const norms: Record<string, number | null> = {};
    for (const l of lines) {
      const v = val[l.variantId] ?? "";
      const n = v === "" ? null : Math.trunc(Number(v));
      if ((n ?? null) !== (l.minQty ?? null)) norms[l.variantId] = n;
    }
    start(async () => {
      const r = await normsAction({ clubId, norms });
      setRes(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар" style={{ maxWidth: 320 }} />
      <div className="table-wrap" style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>В клубе</th>
              <th style={{ textAlign: "right" }}>На складе</th>
              <th>Норма, шт</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.variantId}>
                <td>{l.name}</td>
                <td style={{ textAlign: "right" }}>{l.qty}</td>
                <td style={{ textAlign: "right" }}>{l.warehouse}</td>
                <td>
                  <input
                    className="input"
                    inputMode="numeric"
                    style={{ width: 80 }}
                    value={val[l.variantId] ?? ""}
                    placeholder="—"
                    onChange={(e) => setVal((v) => ({ ...v, [l.variantId]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    aria-label={`Норма «${l.name}»`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {res.error && <div className="form-error">{res.error}</div>}
      {res.ok && <div className="form-ok">{res.ok}</div>}
      <button type="button" className="btn btn--line" style={{ alignSelf: "flex-start" }} disabled={pending || readonly} onClick={save}>
        {pending ? "Сохраняем…" : "Сохранить нормы"}
      </button>
    </div>
  );
}
