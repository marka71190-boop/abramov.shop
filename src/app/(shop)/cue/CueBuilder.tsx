"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { cleanEngraving, cueKey, cueSvg, resolveCue, type CueConfig, type CueSelection } from "@/lib/cue-config";
import { rub } from "@/lib/format";
import { ecommerce, goal } from "@/lib/track";

const plus = (k: number) => (k > 0 ? `+${rub(k)}` : k < 0 ? `−${rub(-k)}` : "включено");

export function CueBuilder({ config, initial }: { config: CueConfig; initial: CueSelection }) {
  const cart = useCart();
  const [sel, setSel] = useState<CueSelection>(initial);
  const [added, setAdded] = useState(false);
  const r = useMemo(() => resolveCue(config, sel), [config, sel]);
  const svg = useMemo(() => (typeof r === "string" ? "" : cueSvg(r, { id: "b" })), [r]);
  const engr = config.groups.find((g) => g.id === "e");

  const set = (id: keyof CueSelection, v: string) => {
    setAdded(false);
    setSel((s) => ({ ...s, [id]: v }));
  };

  function add() {
    if (typeof r === "string") return;
    const key = cueKey({ ...sel, e: sel.e ? cleanEngraving(sel.e, engr?.maxLength) : undefined });
    cart.add(key, 1);
    setAdded(true);
    goal("add_to_cart", { from: "cue" });
    ecommerce("add", [{ id: "CHAMPION", name: "Кий «Чемпион»", price: r.price / 100, quantity: 1, variant: r.summary }]);
  }

  return (
    <div className="cue-layout">
      <div className="cue-preview panel" aria-live="polite">
        <div className="cue-preview__svg" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="cue-preview__legend small muted">Схема: цвета пород и отделки примерные — у натурального дерева рисунок у каждого кия свой.</div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {config.groups.map((g, gi) =>
          g.id === "e" ? (
            <fieldset key={g.id} className="panel stack">
              <legend className="step">
                <span>{gi + 1}</span> {g.title} · {plus(g.price ?? 0)}
              </legend>
              {g.help && <p className="small muted" style={{ margin: 0 }}>{g.help}</p>}
              <label className="field">
                Текст (необязательно)
                <input
                  className="input"
                  value={sel.e ?? ""}
                  maxLength={g.maxLength ?? 24}
                  placeholder="Например, A. Abramov"
                  onChange={(e) => set("e", e.target.value.replace(/[^\p{L}\p{N} .,'«»"&№#-]/gu, ""))}
                />
              </label>
            </fieldset>
          ) : (
            <fieldset key={g.id} className="panel stack">
              <legend className="step">
                <span>{gi + 1}</span> {g.title}
              </legend>
              {g.help && <p className="small muted" style={{ margin: 0 }}>{g.help}</p>}
              <div className="seg seg--cue" role="radiogroup" aria-label={g.title}>
                {g.options.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={sel[g.id] === o.id} onClick={() => set(g.id, o.id)}>
                    <strong>
                      {o.color && <i className="swatch" style={{ background: o.color }} aria-hidden />}
                      {o.name}
                    </strong>
                    <span>{plus(o.price)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ),
        )}
      </div>

      <aside className="summary cue-summary">
        <div className="label">Ваш кий</div>
        {typeof r === "string" ? (
          <div className="form-error">{r}</div>
        ) : (
          <>
            <div className="summary__row">
              <span>Базовая цена</span>
              <span>{rub(config.basePrice)}</span>
            </div>
            {r.spec.map((x) => (
              <div key={x.group} className="summary__row small">
                <span className="muted">
                  {x.group}: <span style={{ color: "var(--c-text)" }}>{x.value}</span>
                </span>
                <span>{x.price ? `+${rub(x.price)}` : ""}</span>
              </div>
            ))}
            <div className="summary__total">
              <span>Итого</span>
              <span>{rub(r.price)}</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Изготовим за {config.leadDays} дн. после оплаты, затем отправим СДЭК. Оплата — 100% онлайн при оформлении.
            </p>
            <button type="button" className="btn btn--gold btn--block" onClick={add}>
              {added ? "Добавлено ✓ Добавить ещё" : "В корзину"}
            </button>
            {added && (
              <Link href="/cart" className="btn btn--line btn--block">
                Перейти в корзину
              </Link>
            )}
            <p className="small muted" style={{ margin: 0 }}>
              Кий делается по вашим параметрам. Исправный кий, изготовленный по индивидуальному заказу, нельзя вернуть просто так — только при браке (п. 4 ст. 26.1 Закона о защите прав потребителей).
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
