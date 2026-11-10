"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { VariantPicker, type PickOption } from "@/components/admin/VariantPicker";
import { BarcodeScanner, signal } from "@/components/pos/BarcodeScanner";
import { useScanWedge } from "@/components/pos/useScanWedge";
import { codeMatches } from "@/lib/code-match";
import { bindCodeAction, quickProductAction, saveMoves, type MoveResult } from "../actions";

type Kind = "RECEIPT" | "WRITE_OFF" | "INVENTORY";
type Line = { o: PickOption; qty: string; cost: string };

const rubStr = (k: number | null) => (k == null ? "" : String(k / 100));
const toKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);
const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100) + " ₽";

const TEXT: Record<Kind, { qty: string; btn: string; note: string; notePh: string }> = {
  RECEIPT: { qty: "Пришло, шт", btn: "Провести приход", note: "Поставщик, номер накладной", notePh: "Например: Longoni, накладная 154" },
  WRITE_OFF: { qty: "Списать, шт", btn: "Списать", note: "Причина списания", notePh: "Брак, порча, подарок, для себя…" },
  INVENTORY: { qty: "Стало, шт", btn: "Сохранить остатки", note: "Комментарий", notePh: "Пересчёт склада 6 ноября" },
};

export function MoveForm({
  kind,
  options: initialOptions,
  clubId = null,
  categories = [],
}: {
  kind: Kind;
  options: PickOption[];
  clubId?: string | null;
  categories?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Отсканировали код, которого нет ни у одного товара: привязать к товару или создать новый
  const [unknown, setUnknown] = useState<string | null>(null);
  // Что пришло последним приходом — для печати этикеток
  const [received, setReceived] = useState<{ id: string; qty: number }[]>([]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const t = TEXT[kind];
  const picked = useMemo(() => new Set(lines.map((l) => l.o.id)), [lines]);

  // Инвентаризация: список длинный и правится долго — черновик в браузере, перезагрузка ничего не теряет
  const [fillN, setFillN] = useState("100");
  const [find, setFind] = useState("");
  const draftKey = `inventory:${clubId ?? "wh"}`;
  const [restored, setRestored] = useState(kind !== "INVENTORY");
  useEffect(() => {
    if (kind !== "INVENTORY") return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "[]") as [string, string][];
      const byId = new Map(options.map((o) => [o.id, o]));
      const ls = saved.filter(([id]) => byId.has(id)).map(([id, qty]) => ({ o: byId.get(id)!, qty, cost: "" }));
      if (ls.length) setLines(ls);
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (kind !== "INVENTORY" || !restored) return;
    try {
      if (lines.length) localStorage.setItem(draftKey, JSON.stringify(lines.map((l) => [l.o.id, l.qty])));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [lines, kind, draftKey, restored]);

  /** Первая инвентаризация: всем товарам сразу N шт, дальше поправить, где не так */
  const fillAll = () => {
    const n = Math.max(0, Math.trunc(Number(fillN)) || 0);
    if (lines.length && !window.confirm(`Поставить ${n} шт всем товарам? Уже вписанные количества заменятся.`)) return;
    setLines(options.map((o) => ({ o, qty: String(n), cost: "" })));
  };

  // Уже в списке — +1 шт (сканер, повторный выбор); при инвентаризации просто поднимаем строку наверх
  const add = (o: PickOption) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.o.id === o.id);
      const fresh = { o, qty: kind === "INVENTORY" ? String(o.stock) : "1", cost: kind === "RECEIPT" ? rubStr(o.cost) : "" };
      if (i < 0) return [fresh, ...ls];
      const cur = ls[i];
      const next = kind === "INVENTORY" ? cur : { ...cur, qty: String((Math.trunc(Number(cur.qty)) || 0) + 1) };
      return [next, ...ls.filter((_, n) => n !== i)];
    });

  /** Код со сканера (камера или сканер-пистолет) */
  const onCode = (code: string) => {
    const o = options.find((x) => codeMatches(x, code));
    if (!o) {
      signal(false);
      if (kind === "RECEIPT") {
        setUnknown(code.trim());
        setScan(false);
        setScanMsg({ text: `Код ${code} не найден — привяжите его к товару или создайте новый ниже`, ok: false });
      } else setScanMsg({ text: `Не нашли товар с кодом ${code}`, ok: false });
      return null;
    }
    add(o);
    signal(true);
    const was = lines.find((l) => l.o.id === o.id);
    const n = kind === "INVENTORY" ? null : (Math.trunc(Number(was?.qty)) || 0) + 1;
    setScanMsg({ text: `+ ${o.name}${n ? ` — ${n} шт` : ""}`, ok: true });
    return o.name;
  };
  useScanWedge((code) => void onCode(code), !scan && !unknown);

  /** Новый товар или привязанный код — в список вариантов и сразу в приход */
  const adopt = (o: PickOption) => {
    setOptions((os) => [o, ...os.filter((x) => x.id !== o.id)]);
    setUnknown(null);
    add(o);
    setScanMsg({ text: `+ ${o.name} — 1 шт`, ok: true });
  };
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const total = kind === "RECEIPT" ? lines.reduce((a, l) => a + (Number(l.qty) || 0) * (toKop(l.cost) || 0), 0) : 0;

  function submit() {
    setRes({});
    const out: { variantId: string; qty: number; unitCost: number | null }[] = [];
    for (const l of lines) {
      const qty = Math.trunc(Number(l.qty));
      if (!Number.isFinite(qty) || qty < (kind === "INVENTORY" ? 0 : 1)) return setRes({ error: `«${l.o.name}»: проверьте количество` });
      if (kind === "WRITE_OFF" && qty > l.o.stock) return setRes({ error: `«${l.o.name}»: свободно только ${l.o.stock} шт` });
      let unitCost: number | null = null;
      if (kind === "RECEIPT" && l.cost.trim()) {
        unitCost = toKop(l.cost);
        if (!(unitCost >= 0)) return setRes({ error: `«${l.o.name}»: закупочная цена — в рублях, например 1250` });
      }
      out.push({ variantId: l.o.id, qty, unitCost });
    }
    start(async () => {
      const r = await saveMoves({ type: kind, clubId, note: note.trim() || undefined, lines: out });
      setRes(r);
      if (r.ok) {
        if (kind === "RECEIPT") setReceived(out.map((l) => ({ id: l.variantId, qty: l.qty })));
        setLines([]);
        setNote("");
        router.refresh();
      }
    });
  }

  const labelsQuery = encodeURIComponent(received.map((r) => `${r.id}:${r.qty}`).join(","));

  return (
    <div className="stack" style={{ gap: 14 }}>
      {kind === "INVENTORY" && (
        <div className="panel stack" style={{ gap: 8, borderColor: "var(--c-gold)" }}>
          <b>Первая инвентаризация — всем товарам сразу</b>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input className="input" inputMode="numeric" style={{ width: 80 }} value={fillN} onChange={(e) => setFillN(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Сколько штук всем" />
            <span>шт</span>
            <button type="button" className="btn btn--gold btn--sm" onClick={fillAll}>
              Заполнить все ({options.length})
            </button>
          </div>
          <details className="small muted">
            <summary>Как это работает</summary>
            У всех товаров сразу {fillN || 0} шт — дальше поправляете, где на самом деле другое количество. Список сохраняется в браузере: можно прерваться и
            продолжить. На сайте ничего не меняется, пока не нажмёте «{t.btn}». Нажимайте, когда всё поправлено: что останется в остатке, сайт покажет «в наличии» и
            напишет тем, кто ждал товар.
          </details>
        </div>
      )}
      {scan && <BarcodeScanner onCode={onCode} onClose={() => setScan(false)} />}
      <div className="pos-find">
        <VariantPicker
          options={options}
          onPick={add}
          exclude={kind === "INVENTORY" ? picked : undefined}
          autoFocus
          hint={(o) => `в наличии ${o.stock} шт${o.cost != null ? ` · закупка ${fmt(o.cost)}` : ""}`}
          placeholder="Название, артикул или штрихкод"
        />
        {!scan && (
          <button type="button" className="btn btn--line pos-scan-btn" onClick={() => setScan(true)} aria-label="Сканировать штрихкод камерой">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8" />
            </svg>
            <span>Камера</span>
          </button>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Сканер-пистолет (USB или Bluetooth) работает сразу — просто сканируйте: каждый скан +1 шт.
        {kind === "RECEIPT" ? " Незнакомый штрихкод с упаковки можно тут же привязать к товару или завести новый товар." : ""}
      </p>
      {scanMsg && !scan && (
        <div className={scanMsg.ok ? "form-ok" : "form-error"} role="status">
          {scanMsg.text}
        </div>
      )}
      {unknown && <UnknownCode code={unknown} options={options} clubId={clubId} categories={categories} onDone={adopt} onCancel={() => setUnknown(null)} />}

      {kind === "INVENTORY" && lines.length > 15 && (
        <input className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Найти в списке: название, артикул, штрихкод" aria-label="Найти в списке" />
      )}
      {lines.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th style={{ textAlign: "right" }}>Сейчас</th>
                <th>{t.qty}</th>
                {kind === "RECEIPT" && <th>Закупка за 1 шт, ₽</th>}
                {kind === "INVENTORY" && <th style={{ textAlign: "right" }}>Разница</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const needle = find.trim().toLowerCase().replace(/ё/g, "е");
                if (needle && !`${l.o.name} ${l.o.sku ?? ""} ${l.o.barcode ?? ""}`.toLowerCase().replace(/ё/g, "е").includes(needle)) return null;
                const diff = kind === "INVENTORY" ? (Math.trunc(Number(l.qty)) || 0) - l.o.stock : 0;
                return (
                  <tr key={l.o.id}>
                    <td>
                      {l.o.name}
                      {l.o.sku && <div className="muted small">{l.o.sku}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{l.o.stock}</td>
                    <td>
                      <input className="input bulk-input" inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: 90 }} aria-label={`${t.qty}: ${l.o.name}`} />
                    </td>
                    {kind === "RECEIPT" && (
                      <td>
                        <input className="input bulk-input" inputMode="decimal" value={l.cost} placeholder="—" onChange={(e) => upd(i, { cost: e.target.value })} style={{ width: 120 }} aria-label="Закупочная цена" />
                      </td>
                    )}
                    {kind === "INVENTORY" && (
                      <td style={{ textAlign: "right" }} className={diff < 0 ? "form-error" : diff > 0 ? "form-ok" : "muted"}>
                        {diff > 0 ? `+${diff}` : diff || "—"}
                      </td>
                    )}
                    <td>
                      <button type="button" className="linklike small" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
                        Убрать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!lines.length && <p className="muted small">Начните вводить название товара — он появится в списке. Можно добавить сколько угодно строк.</p>}

      <label className="field">
        {t.note}
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} maxLength={300} />
      </label>

      {kind === "RECEIPT" && total > 0 && <p style={{ margin: 0 }}>Сумма прихода по закупке: <b>{fmt(total)}</b></p>}
      {kind === "RECEIPT" && (
        <p className="muted small" style={{ margin: 0 }}>
          Закупочная цена усредняется: если на складе было 2 шт по 1 000 ₽ и пришло 2 шт по 1 200 ₽, станет 1 100 ₽. Пустая цена — остаётся прежняя.
        </p>
      )}
      {kind === "INVENTORY" && (
        <p className="muted small" style={{ margin: 0 }}>
          Указывайте, сколько товара <b>свободно для продажи</b>: не считайте то, что отложено под оплаченные, но ещё не отправленные заказы.
        </p>
      )}

      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn--gold" disabled={pending || !lines.length} onClick={submit}>
          {pending ? "Сохраняем…" : t.btn}
        </button>
        <Link href="/admin/stock" className="btn btn--line">
          К остаткам
        </Link>
        {res.ok && <span className="form-ok">{res.ok}</span>}
        {res.error && <span className="form-error">{res.error}</span>}
      </div>
      {received.length > 0 && res.ok && (
        <div className="panel row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>Этикетки на пришедшее ({received.reduce((a, r) => a + r.qty, 0)} шт):</span>
          <a className="btn btn--gold btn--sm" href={`/admin/stock/labels/niimbot?p=1&i=${labelsQuery}`}>
            Файл для NIIMBOT
          </a>
          <a className="btn btn--line btn--sm" href={`/print/labels?f=50x30&p=1&q=1&i=${labelsQuery}`} target="_blank" rel="noopener">
            Печать из браузера
          </a>
        </div>
      )}
    </div>
  );
}

/** Незнакомый штрихкод при приёмке: привязать к существующему товару или завести новый черновик */
function UnknownCode({
  code,
  options,
  clubId,
  categories,
  onDone,
  onCancel,
}: {
  code: string;
  options: PickOption[];
  clubId: string | null;
  categories: { id: string; name: string }[];
  onDone: (o: PickOption) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"bind" | "new">("bind");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const bind = (o: PickOption) =>
    start(async () => {
      setErr("");
      const r = await bindCodeAction({ variantId: o.id, code, clubId });
      if ("error" in r && r.error) return setErr(r.error);
      if ("option" in r && r.option) onDone(r.option as PickOption);
    });
  const create = () =>
    start(async () => {
      setErr("");
      const kop = toKop(price);
      if (!(kop >= 0) || !price.trim()) return setErr("Укажите цену продажи в рублях");
      const r = await quickProductAction({ code, name, price: kop, categoryId: cat || null, clubId });
      if ("error" in r && r.error) return setErr(r.error);
      if ("option" in r && r.option) onDone(r.option as PickOption);
    });

  return (
    <div className="panel stack" style={{ gap: 10, borderColor: "var(--c-gold)" }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b>
          Новый код: <code>{code}</code>
        </b>
        <button type="button" className="linklike small" onClick={onCancel}>
          Пропустить
        </button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className={`btn btn--sm ${mode === "bind" ? "btn--gold" : "btn--line"}`} onClick={() => setMode("bind")}>
          Это товар из каталога
        </button>
        <button type="button" className={`btn btn--sm ${mode === "new" ? "btn--gold" : "btn--line"}`} onClick={() => setMode("new")}>
          Новый товар
        </button>
      </div>
      {mode === "bind" ? (
        <>
          <VariantPicker options={options} onPick={bind} autoFocus placeholder="Какой это товар? Начните вводить название" />
          <p className="muted small" style={{ margin: 0 }}>
            Штрихкод с упаковки станет штрихкодом и артикулом товара — дальше он будет находиться сканером сразу. Старые этикетки товара тоже продолжат работать.
          </p>
        </>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название товара" maxLength={200} autoFocus />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" style={{ width: 160 }} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена продажи, ₽" />
            {categories.length > 0 && (
              <select className="select" style={{ flex: "1 1 180px" }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория">
                <option value="">Категория — потом</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Товар появится черновиком — на сайте его не видно, пока не добавите фото и не опубликуете. Остаток придёт с этим приходом.
          </p>
          <button type="button" className="btn btn--gold btn--sm" style={{ alignSelf: "flex-start" }} disabled={pending || name.trim().length < 2} onClick={create}>
            {pending ? "Создаём…" : "Создать и добавить в приход"}
          </button>
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
