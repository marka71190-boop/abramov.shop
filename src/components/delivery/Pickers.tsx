"use client";
/** Выбор города и пункта выдачи СДЭК — общие для оформления заказа и «Моих адресов». */
import { useEffect, useMemo, useRef, useState } from "react";
import { PvzMap } from "./PvzMap";

export interface City {
  code: number;
  name: string;
}
export interface Point {
  code: string;
  name: string;
  address: string;
  workTime: string;
  postalCode: string | null;
  lat?: number | null;
  lon?: number | null;
}

export function CityPicker({ value, onChange }: { value: City | null; onChange: (c: City | null) => void }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [list, setList] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (value && q === value.name) return;
    if (q.trim().length < 2) {
      setList([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/delivery/cities?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then((x) => x.json());
        if (r.ok) {
          setList(r.cities);
          setErr(null);
          setOpen(true);
        } else setErr(r.error);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, value]);

  return (
    <div className="suggest">
      <label className="field">
        Город
        <input
          className="input"
          value={q}
          placeholder="Начните вводить: Краснодар"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls="city-list"
          onChange={(e) => {
            setQ(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => list.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </label>
      {err && <div className="small" style={{ color: "var(--c-danger)", marginTop: 6 }}>{err}</div>}
      {open && list.length > 0 && (
        <ul className="suggest__list" id="city-list" role="listbox">
          {list.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={value?.code === c.code}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c);
                  setQ(c.name);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PointPicker({ city, value, onChange }: { city: City; value: Point | null; onChange: (p: Point | null) => void }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("map");

  useEffect(() => {
    setPoints(null);
    setErr(null);
    fetch(`/api/delivery/points?city=${city.code}`)
      .then((x) => x.json())
      .then((r) => {
        if (!r.ok) return setErr(r.error);
        setPoints(r.points);
        setMapKey(r.mapKey ?? null);
      })
      .catch(() => setErr("Не удалось загрузить пункты выдачи"));
  }, [city.code]);

  // Сохранённый пункт больше не работает — просим выбрать другой
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (points && value && !points.some((p) => p.code === value.code)) {
      setGone(true);
      onChange(null);
    }
  }, [points, value, onChange]);

  const onMap = useMemo(() => (points ?? []).filter((p): p is Point & { lat: number; lon: number } => typeof p.lat === "number" && typeof p.lon === "number"), [points]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (points ?? []).filter((p) => !f || `${p.address} ${p.name}`.toLowerCase().includes(f)).slice(0, 60);
  }, [points, filter]);

  if (value) {
    return (
      <div className="picked">
        <div>
          <div style={{ fontWeight: 600 }}>{value.address}</div>
          <div className="muted small">
            СДЭК {value.code}
            {value.workTime ? ` · ${value.workTime}` : ""}
          </div>
        </div>
        <button type="button" className="linklike small" onClick={() => onChange(null)}>
          Изменить
        </button>
      </div>
    );
  }
  if (err) return <div className="form-error">{err}</div>;
  if (!points) return <div className="muted small">Загружаем пункты выдачи…</div>;
  if (!points.length) return <div className="form-error">В этом городе нет пунктов выдачи СДЭК — выберите доставку курьером.</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {gone && <div className="notice" style={{ margin: 0 }}>Сохранённый пункт выдачи СДЭК больше не работает — выберите другой.</div>}
      {mapKey && onMap.length > 0 && (
        <div className="seg seg--tabs" role="radiogroup" aria-label="Как выбрать пункт">
          <button type="button" role="radio" aria-checked={view === "map"} onClick={() => setView("map")}>
            <strong>На карте</strong>
          </button>
          <button type="button" role="radio" aria-checked={view === "list"} onClick={() => setView("list")}>
            <strong>Списком</strong>
          </button>
        </div>
      )}
      {mapKey && onMap.length > 0 && view === "map" ? (
        <PvzMap mapKey={mapKey} points={onMap} onPick={onChange} />
      ) : (
        <>
      <input className="input" placeholder={`Улица или метро — ${points.length} пунктов`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="pvz-list" role="listbox" aria-label="Пункты выдачи">
        {shown.map((p) => (
          <li key={p.code}>
            <button type="button" role="option" aria-selected={false} onClick={() => onChange(p)}>
              <span style={{ fontWeight: 600 }}>{p.address}</span>
              <span className="muted small">{p.workTime || p.name}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="muted small" style={{ padding: 12 }}>Ничего не нашли — уточните запрос</li>}
      </ul>
        </>
      )}
    </div>
  );
}
