"use client";
import { useState, useTransition } from "react";
import { setVisibility } from "./actions";

const OPTIONS = [
  { value: "PUBLISHED", label: "Опубликовано" },
  { value: "HIDDEN", label: "Скрыто" },
  { value: "DRAFT", label: "Черновик" },
];

/** Быстрое переключение «открыто / скрыто» прямо в списке. */
export function VisibilitySelect({ entity, id, value }: { entity: "page" | "category" | "product"; id: string; value: string }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const tone = v === "PUBLISHED" ? "var(--c-success)" : v === "HIDDEN" ? "var(--c-gold)" : "var(--c-muted)";
  return (
    <select
      className="select"
      aria-label="Видимость"
      value={v}
      disabled={pending}
      style={{ minHeight: 36, width: "auto", color: tone, borderColor: tone }}
      onChange={(e) => {
        const next = e.target.value;
        setV(next);
        start(() => setVisibility(entity, id, next));
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
