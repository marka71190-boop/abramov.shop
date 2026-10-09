"use client";
import { useOptimistic, useTransition } from "react";

export function Toggle({ label, on, action }: { label: string; on: boolean; action: (v: boolean) => Promise<void> }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="toggle"
      aria-label={label}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await action(!optimistic);
        })
      }
    >
      <span />
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="btn btn--gold"
      onClick={async (e) => {
        const btn = e.currentTarget;
        await navigator.clipboard.writeText(text).catch(() => {});
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Копировать"), 1600);
      }}
    >
      Копировать
    </button>
  );
}
