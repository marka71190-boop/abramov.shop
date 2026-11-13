"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { applyAction, matchBatchAction, rematchAction, retryNoneAction, setCardAction } from "./actions";

export interface Row {
  id: string;
  name: string;
  title: string | null;
  link: string | null;
  code: string | null;
  score: number;
  note: string | null;
  attrs: string[];
  description: string;
  hasDescription: boolean;
  weight: number | null;
}

/** Поиск у поставщика порциями: страница сама зовёт следующую, пока не кончатся товары или не нажмут «Стоп» */
export function SearchRunner({ todo, none }: { todo: number; none: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(todo);
  const [stat, setStat] = useState({ found: 0, none: 0 });
  const [msg, setMsg] = useState("");
  const stop = useRef(false);

  async function run() {
    stop.current = false;
    setRunning(true);
    setMsg("");
    let found = 0;
    let miss = 0;
    let fails = 0;
    for (;;) {
      const r = await matchBatchAction();
      if (r.error) {
        // Поставщик не ответил — пара попыток и останавливаемся; найденное уже сохранено
        if (++fails >= 3) {
          setMsg(`${r.error}. Найденное сохранено — нажмите «Искать» ещё раз позже.`);
          break;
        }
        continue;
      }
      fails = 0;
      found += r.found;
      miss += r.none;
      setStat({ found, none: miss });
      setLeft(r.left);
      router.refresh();
      if (r.left <= 0 || stop.current) break;
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!running ? (
          <button type="button" className="btn btn--gold" disabled={left <= 0} onClick={run}>
            {left > 0 ? `Искать на fortu.ru · ${left} тов.` : "Все товары уже искали"}
          </button>
        ) : (
          <button type="button" className="btn btn--line" onClick={() => (stop.current = true)}>
            Стоп
          </button>
        )}
        {running && (
          <span role="status">
            Ищем… осталось {left} · нашли {stat.found} · не нашли {stat.none}
          </span>
        )}
        {!running && stat.found + stat.none > 0 && (
          <span className="form-ok" role="status">
            Готово: нашли {stat.found}, не нашли {stat.none}
          </span>
        )}
        {!running && none > 0 && (
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={async () => {
              const r = await retryNoneAction();
              setMsg(r.ok ?? r.error ?? "");
              router.refresh();
              // Очередь изменилась — счётчик кнопки берём с сервера заново
              setLeft((x) => x + none);
            }}
          >
            Искать «не нашли» заново · {none}
          </button>
        )}
      </div>
      {msg && <div className="small">{msg}</div>}
      <p className="muted small" style={{ margin: 0 }}>
        Поиск идёт не спеша — примерно 5–10 товаров в минуту, чтобы не нагружать сайт поставщика. Страницу держите открытой; закрыли — нажмите «Искать» снова,
        продолжит с того же места.
      </p>
    </div>
  );
}

const tone = (score: number, sure: number) => (score >= sure ? { cls: "pill--ok", text: "уверенно" } : score >= 60 ? { cls: "pill--warn", text: "проверьте" } : { cls: "pill--bad", text: "сомнительно" });

export function SupplierTable({ rows, tab, sure }: { rows: Row[]; tab: string; sure: number }) {
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [fix, setFix] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const canApply = tab === "found" || tab === "applied";
  const chosen = rows.filter((r) => on[r.id]);
  const act = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        setOn({});
        setFix(null);
        setRef("");
        router.refresh();
      }
    });

  // Итог последнего действия показываем и когда список опустел (заполнили всё, что было)
  if (!rows.length)
    return (
      <div className="stack" style={{ gap: 10 }}>
        {msg.ok && <div className="form-ok">{msg.ok}</div>}
        <p className="muted" style={{ margin: 0 }}>
          {tab === "found" ? "Здесь появятся товары, которые нашлись у поставщика. Нажмите «Искать на fortu.ru»." : "Пусто."}
        </p>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 12 }}>
      {canApply && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setOn(Object.fromEntries(rows.filter((r) => r.score >= sure).map((r) => [r.id, true])))}>
            Отметить уверенные · {rows.filter((r) => r.score >= sure).length}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setOn(Object.fromEntries(rows.map((r) => [r.id, true])))}>
            Все
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setOn({})}>
            Снять
          </button>
        </div>
      )}
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {canApply && <th style={{ width: 36 }} />}
              <th>Наш товар</th>
              <th>У поставщика</th>
              {canApply && <th>Что заполнится</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = tone(r.score, sure);
              return (
                <tr key={r.id} className={on[r.id] ? "is-on" : undefined}>
                  {canApply && (
                    <td>
                      <input type="checkbox" className="labels-check" checked={!!on[r.id]} onChange={(e) => setOn({ ...on, [r.id]: e.target.checked })} aria-label={`Заполнить: ${r.name}`} />
                    </td>
                  )}
                  <td>
                    <Link href={`/admin/catalog/product/${r.id}`}>{r.name}</Link>
                  </td>
                  <td>
                    {r.title ? (
                      <>
                        {r.link ? (
                          <a href={r.link} target="_blank" rel="noopener noreferrer">
                            {r.title}
                          </a>
                        ) : (
                          r.title
                        )}
                        <div className="small" style={{ marginTop: 4 }}>
                          {tab !== "none" && <span className={`pill ${t.cls}`}>{t.text}</span>} <span className="muted">{r.code ? `код ${r.code}` : ""}</span>
                        </div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {r.note && <div className="muted small">{r.note}</div>}
                    {fix === r.id && (
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <input className="input" style={{ flex: "1 1 220px", minHeight: 40 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ссылка fortu.ru/product/… или код товара" aria-label={`Ссылка или код: ${r.name}`} />
                        <button type="button" className="btn btn--gold btn--sm" disabled={pending || !ref.trim()} onClick={() => act(() => rematchAction(r.id, ref))}>
                          {pending ? "Ищем…" : "Взять этот"}
                        </button>
                      </div>
                    )}
                  </td>
                  {canApply && (
                    <td className="small">
                      {r.attrs.length > 0 && (
                        <details>
                          <summary>Характеристик: {r.attrs.length}</summary>
                          <div style={{ marginTop: 4 }}>
                            {r.attrs.map((a) => (
                              <div key={a}>{a}</div>
                            ))}
                          </div>
                        </details>
                      )}
                      {r.description ? (
                        <details>
                          <summary>Описание{r.hasDescription ? " — уже есть, не тронем" : ""}</summary>
                          <div style={{ whiteSpace: "pre-line", marginTop: 4, maxWidth: 460 }}>{r.description}</div>
                        </details>
                      ) : (
                        <div className="muted">Описание: мало данных</div>
                      )}
                      {r.weight && <div>Вес для доставки: {r.weight} г</div>}
                      {!r.attrs.length && !r.description && !r.weight && tab === "found" && <div className="muted">Заполнять нечего</div>}
                    </td>
                  )}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn--sm btn--line" onClick={() => (setFix(fix === r.id ? null : r.id), setRef(""))} aria-label={`Указать товар поставщика: ${r.name}`}>
                      {r.title && tab !== "none" ? "Не тот" : "Указать"}
                    </button>{" "}
                    {tab !== "skip" ? (
                      <button type="button" className="btn btn--sm btn--line" disabled={pending} onClick={() => act(() => setCardAction(r.id, "skip"))} aria-label={`Пропустить: ${r.name}`}>
                        Пропустить
                      </button>
                    ) : (
                      <button type="button" className="btn btn--sm btn--line" disabled={pending} onClick={() => act(() => setCardAction(r.id, "retry"))}>
                        Вернуть
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canApply && (
        <div className="bulk-save">
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>Заменить описание, даже если оно уже написано</span>
          </label>
          <button type="button" className="btn btn--gold btn--sm" disabled={pending || !chosen.length} onClick={() => act(() => applyAction({ ids: chosen.map((r) => r.id), overwrite }))}>
            {pending ? "Заполняем…" : `Заполнить отмеченные${chosen.length ? ` · ${chosen.length}` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
