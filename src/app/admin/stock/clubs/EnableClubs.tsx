"use client";
/**
 * Клубы, куда пока нельзя привезти товар: у них не включён свой учёт остатков.
 * Кнопка включает учёт прямо здесь — в перемещении, приходе и инвентаризации.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ownStockAction } from "../actions";

export function EnableClubs({ clubs, owner }: { clubs: { id: string; title: string }[]; owner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!clubs.length) return null;
  return (
    <div className="panel stack" style={{ gap: 8 }}>
      <b>Не видите нужный клуб?</b>
      <p className="muted small" style={{ margin: 0 }}>
        Товар можно привозить только в клубы со своим учётом остатков. После включения касса клуба продаёт то, что вы туда привезли, а не со
        склада.{owner ? "" : " Включить учёт может владелец."}
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {clubs.map((c) => (
          <button
            key={c.id}
            type="button"
            className="btn btn--line btn--sm"
            disabled={pending || !owner}
            onClick={() => {
              if (!confirm(`Включить учёт остатков в клубе «${c.title}»? Касса клуба будет продавать только то, что вы туда привезёте.`)) return;
              start(async () => {
                setError("");
                const r = await ownStockAction(c.id, true);
                if (r.error) setError(r.error);
                else router.refresh();
              });
            }}
          >
            + {c.title}
          </button>
        ))}
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
