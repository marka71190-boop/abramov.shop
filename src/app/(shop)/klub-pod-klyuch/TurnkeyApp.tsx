"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlanEditor, type Sel } from "@/components/turnkey/PlanEditor";
import { rub } from "@/lib/format";
import { goal } from "@/lib/track";
import { estimate, type TurnkeyConfig } from "@/lib/turnkey-config";
import { autoLayouts, checkLayout, findSpot, lRoom, polygonArea, rectRoom, ZONE_KIND, type Placed, type Plan, type Pt, type Want, type ZoneKind } from "@/lib/turnkey-geom";
import { createTurnkeyAction } from "./actions";

const Scene3D = dynamic(() => import("@/components/turnkey/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="scene3d scene3d--loading">Загружаем 3D…</div>,
});

const DRAFT = "as_turnkey_v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const m2 = (mm2: number) => (mm2 / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const toMm = (v: string) => Math.round(Number(v.replace(",", ".")) * 1000) || 0;

type Template = "rect" | "L" | "free";

export function TurnkeyApp({ cfg, user }: { cfg: TurnkeyConfig; user: { name: string; phone: string; email: string } | null }) {
  const models = useMemo(() => cfg.models.filter((m) => m.active), [cfg.models]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tpl, setTpl] = useState<Template>("rect");
  const [dims, setDims] = useState({ L: "20", W: "12", a: "8", b: "5" });
  const [plan, setPlan] = useState<Plan>({ points: rectRoom(20000, 12000), columns: [], zones: [], ceiling: 3000 });
  const [tables, setTables] = useState<Placed[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [drawing, setDrawing] = useState<Pt[] | null>(null);
  const [ortho, setOrtho] = useState(true);
  const [want, setWant] = useState<Record<string, number | "max">>(() => (models[0] ? { [models[0].id]: "max" } : {}));
  const [variants, setVariants] = useState<{ tables: Placed[]; count: number; rot: 0 | 90 }[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"plan" | "3d">("plan");

  // Черновик в браузере: можно уйти и вернуться
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.plan?.points?.length >= 3) setPlan(d.plan);
        if (Array.isArray(d?.tables)) setTables(d.tables.filter((t: Placed) => models.some((m) => m.id === t.modelId)));
        if (d?.tpl) setTpl(d.tpl);
        if (d?.step === 2 || d?.step === 3) setStep(d.step);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ plan, tables, tpl, step }));
    } catch {}
  }, [plan, tables, tpl, step]);

  const applyTemplate = (t: Template, d = dims) => {
    setTpl(t);
    setSel(null);
    if (t === "free") {
      setDrawing([]);
      return;
    }
    setDrawing(null);
    const L = Math.min(100_000, Math.max(3000, toMm(d.L)));
    const W = Math.min(100_000, Math.max(3000, toMm(d.W)));
    const pts = t === "rect" ? rectRoom(L, W) : lRoom(L, W, Math.min(L - 1000, Math.max(1000, toMm(d.a))), Math.min(W - 1000, Math.max(1000, toMm(d.b))));
    setPlan((p) => ({ ...p, points: pts }));
    setTables([]);
    setVariants([]);
  };

  const area = polygonArea(plan.points);
  const problems = useMemo(() => checkLayout(plan, tables, models, cfg.gaps), [plan, tables, models, cfg.gaps]);
  const est = useMemo(() => estimate(tables, cfg), [tables, cfg]);

  const addRect = (kind: "column" | ZoneKind) => {
    const c = { x: plan.points.reduce((a, p) => a + p.x, 0) / plan.points.length, y: plan.points.reduce((a, p) => a + p.y, 0) / plan.points.length };
    if (kind === "column") {
      const id = `c${uid()}`;
      setPlan({ ...plan, columns: [...plan.columns, { id, x: Math.round(c.x / 100) * 100 - 200, y: Math.round(c.y / 100) * 100 - 200, w: 400, h: 400 }] });
      setSel({ type: "column", id });
    } else {
      const z = ZONE_KIND[kind];
      const id = `z${uid()}`;
      setPlan({ ...plan, zones: [...plan.zones, { id, kind, x: Math.round((c.x - z.w / 2) / 100) * 100, y: Math.round((c.y - z.h / 2) / 100) * 100, w: z.w, h: z.h }] });
      setSel({ type: "zone", id });
    }
  };

  const removeSelected = () => {
    if (!sel) return;
    if (sel.type === "vertex" && plan.points.length > 3) setPlan({ ...plan, points: plan.points.filter((_, i) => i !== sel.i) });
    if (sel.type === "column") setPlan({ ...plan, columns: plan.columns.filter((c) => c.id !== sel.id) });
    if (sel.type === "zone") setPlan({ ...plan, zones: plan.zones.filter((z) => z.id !== sel.id) });
    if (sel.type === "table") setTables(tables.filter((t) => t.id !== sel.id));
    setSel(null);
  };

  const runAuto = () => {
    const list: Want[] = Object.entries(want)
      .filter(([, v]) => v === "max" || v > 0)
      .map(([modelId, count]) => ({ modelId, count }));
    if (!list.length) return;
    setBusy(true);
    setTimeout(() => {
      const v = autoLayouts(plan, list, models, cfg.gaps, 3);
      setVariants(v);
      setTables(v[0]?.tables ?? []);
      setSel(null);
      setBusy(false);
      goal("turnkey_layout", { tables: v[0]?.count ?? 0 });
    }, 30);
  };

  const addTable = (modelId: string) => {
    const m = models.find((x) => x.id === modelId)!;
    const spot = findSpot(plan, tables, m, models, cfg.gaps);
    if (spot) {
      setTables([...tables, spot]);
      setSel({ type: "table", id: spot.id });
    } else alert("Свободного места для такого стола не нашлось — уберите или сдвиньте другие столы");
  };

  const rotateSelected = () => {
    if (sel?.type !== "table") return;
    setTables(tables.map((t) => (t.id === sel.id ? { ...t, rot: t.rot === 0 ? 90 : 0 } : t)));
  };

  const selected = sel?.type === "table" ? tables.find((t) => t.id === sel.id) : null;

  return (
    <div className="turnkey">
      <nav className="turnkey__steps" aria-label="Шаги">
        {(
          [
            [1, "Зал"],
            [2, "Столы"],
            [3, "3D и смета"],
          ] as const
        ).map(([n, label]) => (
          <button key={n} type="button" className={`turnkey__step${step === n ? " is-on" : ""}`} onClick={() => setStep(n)} disabled={n > 1 && plan.points.length < 3}>
            <span>{n}</span> {label}
          </button>
        ))}
      </nav>

      <div className="turnkey__body">
        <div className="turnkey__stage">
          {step === 3 && (
            <div className="turnkey__view">
              <button type="button" className={`vchip${view === "plan" ? " is-on" : ""}`} aria-current={view === "plan" ? "true" : undefined} onClick={() => setView("plan")}>
                План
              </button>
              <button type="button" className="vchip" aria-current={view === "3d" ? "true" : undefined} onClick={() => setView("3d")}>
                3D
              </button>
            </div>
          )}
          {step === 3 && view === "3d" ? (
            <Scene3D plan={plan} tables={tables} models={models} />
          ) : (
            <PlanEditor
              plan={plan}
              onPlan={setPlan}
              tables={tables}
              onTables={setTables}
              models={models}
              gaps={cfg.gaps}
              mode={step === 1 ? "room" : "tables"}
              sel={sel}
              onSel={setSel}
              drawing={step === 1 ? drawing : null}
              onDraw={(pts, done) => {
                if (done && pts) {
                  setPlan({ ...plan, points: pts });
                  setDrawing(null);
                  setTables([]);
                  setVariants([]);
                } else setDrawing(pts);
              }}
              ortho={ortho}
            />
          )}
          <div className="turnkey__meta small muted">
            Площадь зала: <b>{m2(area)} м²</b>
            {tables.length > 0 && (
              <>
                {" "}
                · столов: <b>{tables.length}</b>
              </>
            )}
            {" · "}сетка — 1 м
          </div>
        </div>

        <aside className="turnkey__panel">
          {step === 1 && (
            <div className="stack" style={{ gap: 14 }}>
              <h2 className="h3" style={{ margin: 0 }}>
                Форма и размеры зала
              </h2>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["rect", "Прямоугольный"],
                    ["L", "Г-образный"],
                    ["free", "Нарисовать свой"],
                  ] as const
                ).map(([t, label]) => (
                  <button key={t} type="button" className="vchip" aria-current={tpl === t ? "true" : undefined} onClick={() => applyTemplate(t)}>
                    {label}
                  </button>
                ))}
              </div>
              {tpl !== "free" ? (
                <div className="form-grid turnkey__dims">
                  <label className="field">
                    Длина, м
                    <input className="input" inputMode="decimal" value={dims.L} onChange={(e) => setDims({ ...dims, L: e.target.value })} onBlur={() => applyTemplate(tpl)} />
                  </label>
                  <label className="field">
                    Ширина, м
                    <input className="input" inputMode="decimal" value={dims.W} onChange={(e) => setDims({ ...dims, W: e.target.value })} onBlur={() => applyTemplate(tpl)} />
                  </label>
                  {tpl === "L" && (
                    <>
                      <label className="field">
                        Вырез по длине, м
                        <input className="input" inputMode="decimal" value={dims.a} onChange={(e) => setDims({ ...dims, a: e.target.value })} onBlur={() => applyTemplate(tpl)} />
                      </label>
                      <label className="field">
                        Вырез по ширине, м
                        <input className="input" inputMode="decimal" value={dims.b} onChange={(e) => setDims({ ...dims, b: e.target.value })} onBlur={() => applyTemplate(tpl)} />
                      </label>
                    </>
                  )}
                </div>
              ) : (
                <div className="stack small" style={{ gap: 8 }}>
                  {drawing ? (
                    <>
                      <span>Кликайте по углам зала по очереди. Чтобы замкнуть контур — нажмите на первую точку.</span>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="btn btn--line btn--sm" disabled={!drawing.length} onClick={() => setDrawing(drawing.slice(0, -1))}>
                          Отменить точку
                        </button>
                        <button type="button" className="btn btn--line btn--sm" disabled={drawing.length < 3} onClick={() => (setPlan({ ...plan, points: drawing }), setDrawing(null), setTables([]))}>
                          Замкнуть контур
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setDrawing([])}>
                      Нарисовать заново
                    </button>
                  )}
                  <label className="check">
                    <input type="checkbox" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} />
                    <span>Только прямые углы</span>
                  </label>
                </div>
              )}
              <p className="small muted" style={{ margin: 0 }}>
                Углы можно тянуть мышью или пальцем, «+» на стене добавляет новый угол — так получится зал любой формы.
              </p>
              <label className="field">
                Высота потолка, м
                <input className="input" inputMode="decimal" defaultValue={String(plan.ceiling / 1000).replace(".", ",")} onBlur={(e) => setPlan({ ...plan, ceiling: Math.min(10000, Math.max(2200, toMm(e.target.value) || 3000)) })} />
              </label>
              <div className="stack" style={{ gap: 6 }}>
                <span className="small muted">Что ещё есть в зале:</span>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => addRect("column")}>
                    + Колонна
                  </button>
                  {(["BAR", "ENTRANCE", "LOUNGE", "OTHER"] as const).map((k) => (
                    <button key={k} type="button" className="btn btn--line btn--sm" onClick={() => addRect(k)}>
                      + {ZONE_KIND[k].label}
                    </button>
                  ))}
                </div>
                {sel && sel.type !== "table" && (
                  <button type="button" className="btn btn--danger btn--sm" style={{ justifySelf: "start" }} onClick={removeSelected} disabled={sel.type === "vertex" && plan.points.length <= 3}>
                    Удалить {sel.type === "vertex" ? "угол" : sel.type === "column" ? "колонну" : "зону"}
                  </button>
                )}
              </div>
              <button type="button" className="btn btn--gold" disabled={plan.points.length < 3 || !!drawing} onClick={() => setStep(2)}>
                Дальше: столы →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="stack" style={{ gap: 14 }}>
              <h2 className="h3" style={{ margin: 0 }}>
                Какие столы ставим
              </h2>
              <div className="turnkey__models">
                {models.map((m) => (
                  <div key={m.id} className="turnkey__model">
                    <span className="turnkey__swatch" style={{ background: m.cloth, borderColor: m.frame }} />
                    <div style={{ minWidth: 0 }}>
                      <b>{m.name}</b>
                      <div className="small muted">
                        {(m.length / 1000).toLocaleString("ru-RU")} × {(m.width / 1000).toLocaleString("ru-RU")} м · {m.price ? rub(m.price) : "цена по запросу"}
                      </div>
                    </div>
                    <select className="select" value={String(want[m.id] ?? 0)} onChange={(e) => setWant({ ...want, [m.id]: e.target.value === "max" ? "max" : Number(e.target.value) })} aria-label={`Сколько: ${m.name}`}>
                      <option value="0">—</option>
                      <option value="max">Сколько влезет</option>
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn--gold" onClick={runAuto} disabled={busy || !Object.values(want).some((v) => v === "max" || v > 0)}>
                {busy ? "Считаем варианты…" : "Расставить автоматически"}
              </button>
              {variants.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="small muted">Варианты:</span>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {variants.map((v, i) => (
                      <button key={i} type="button" className="vchip" aria-current={tables === v.tables ? "true" : undefined} onClick={() => (setTables(v.tables), setSel(null))}>
                        {v.count} {v.count === 1 ? "стол" : v.count < 5 ? "стола" : "столов"} · {v.rot === 0 ? "вдоль" : "поперёк"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="small muted" style={{ margin: 0 }}>
                От борта до стены — не меньше {(cfg.gaps.wall / 1000).toLocaleString("ru-RU")} м, между столами — {(cfg.gaps.table / 1000).toLocaleString("ru-RU")} м: столько нужно для удара кием. Столы
                можно двигать вручную — красным подсветится, если места не хватает.
              </p>
              {selected ? (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn--line btn--sm" onClick={rotateSelected}>
                    Повернуть
                  </button>
                  <button type="button" className="btn btn--danger btn--sm" onClick={removeSelected}>
                    Убрать стол
                  </button>
                </div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="small muted">Добавить вручную:</span>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {models.map((m) => (
                      <button key={m.id} type="button" className="btn btn--line btn--sm" onClick={() => addTable(m.id)}>
                        + {m.name.replace("Русский бильярд", "РБ")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="btn btn--gold" disabled={!tables.length} onClick={() => (setStep(3), setView("3d"))}>
                Дальше: 3D и смета →
              </button>
            </div>
          )}

          {step === 3 && <Summary cfg={cfg} est={est} problems={problems.filter(Boolean).length} plan={plan} tables={tables} user={user} onDone={() => localStorage.removeItem(DRAFT)} />}
        </aside>
      </div>
    </div>
  );
}

function Summary({
  cfg,
  est,
  problems,
  plan,
  tables,
  user,
  onDone,
}: {
  cfg: TurnkeyConfig;
  est: ReturnType<typeof estimate>;
  problems: number;
  plan: Plan;
  tables: Placed[];
  user: { name: string; phone: string; email: string } | null;
  onDone: () => void;
}) {
  const [f, setF] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", email: user?.email ?? "", city: "", comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const r = await createTurnkeyAction({ ...f, plan, tables: tables.map((t) => ({ modelId: t.modelId, x: t.x, y: t.y, rot: t.rot })) }).catch(() => ({ error: "Нет связи с сервером" }) as { error: string; number?: string });
    if (r.number) {
      goal("turnkey_request", { tables: tables.length });
      try {
        onDone();
      } catch {}
      window.location.href = `/klub-pod-klyuch/${r.number}`;
      return;
    }
    setSending(false);
    setError(r.error ?? "Ошибка");
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <h2 className="h3" style={{ margin: 0 }}>
        Смета
      </h2>
      {problems > 0 && <div className="form-error small">Столов, где не хватает места: {problems}. Вернитесь к шагу «Столы» и подвиньте их — или отправьте как есть, менеджер подскажет.</div>}
      <div className="turnkey__est">
        {est.lines.map((l) => (
          <div key={l.name} className="turnkey__est-row">
            <span>
              {l.name}
              {l.qty > 1 && <span className="muted"> × {l.qty}</span>}
            </span>
            <b>{l.onRequest ? <span className="muted small">по запросу</span> : rub(l.sum)}</b>
          </div>
        ))}
        <div className="turnkey__est-total">
          <span>{est.total ? `Итого${est.partial ? " без позиций по запросу" : ""}` : "Итого"}</span>
          <b>{est.total ? rub(est.total) : <span className="small">рассчитает менеджер</span>}</b>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {cfg.note}
      </p>
      {user ? (
        <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
          <span className="label">Получить коммерческое предложение</span>
          <input className="input" placeholder="Имя" value={f.name} onChange={set("name")} required />
          <input className="input" placeholder="Телефон" inputMode="tel" value={f.phone} onChange={set("phone")} required />
          <input className="input" type="email" placeholder="Почта" value={f.email} onChange={set("email")} required />
          <input className="input" placeholder="Город, где открываете клуб" value={f.city} onChange={set("city")} />
          <textarea className="textarea" placeholder="Комментарий: сроки, пожелания по столам и оформлению" value={f.comment} onChange={set("comment")} style={{ minHeight: 70, paddingTop: 10 }} />
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn--gold" disabled={sending}>
            {sending ? "Отправляем…" : "Получить КП в PDF"}
          </button>
          <span className="small muted">
            Данные обрабатываем по <Link href="/p/privacy">политике конфиденциальности</Link>.
          </span>
        </form>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small" style={{ margin: 0 }}>
            Чтобы сохранить проект и получить КП, войдите — план зала не потеряется.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/login?next=/klub-pod-klyuch" className="btn btn--gold btn--sm">
              Войти
            </Link>
            <Link href="/register?next=/klub-pod-klyuch" className="btn btn--line btn--sm">
              Регистрация
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
