"use client";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/(shop)/product/actions";

export function FavoriteButton({ productId, initial, variant = "icon" }: { productId: string; initial: boolean; variant?: "icon" | "button" }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const path = usePathname();
  const label = on ? "Убрать из избранного" : "В избранное";
  return (
    <button
      type="button"
      className={variant === "icon" ? "fav" : "btn btn--line fav-btn"}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOn(!on);
        start(async () => {
          const r = await toggleFavorite(productId);
          if (r === null) window.location.href = `/login?next=${encodeURIComponent(path)}`;
          else setOn(r);
        });
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
      {variant === "button" && <span>{on ? "В избранном" : "В избранное"}</span>}
    </button>
  );
}
