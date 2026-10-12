"use client";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleStockAlert } from "@/app/(shop)/product/actions";

export function StockAlert({ productId, initial }: { productId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const path = usePathname();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button
        type="button"
        className={on ? "btn btn--line btn--block" : "btn btn--gold btn--block"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleStockAlert(productId);
            if (r === null) window.location.href = `/login?next=${encodeURIComponent(path)}`;
            else setOn(r);
          })
        }
      >
        {on ? "Сообщим о поступлении ✓" : "Сообщить о поступлении"}
      </button>
      <span className="muted small">{on ? "Пришлём сообщение в Telegram или на почту, как только товар появится" : "Товара сейчас нет в наличии"}</span>
    </div>
  );
}
