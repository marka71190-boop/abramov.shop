"use client";
import { useEffect } from "react";

export function PrintBar({ count, auto }: { count: number; auto: boolean }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 400);
  }, [auto]);
  return (
    <div className="print-bar no-print">
      <span>
        {count} {count === 1 ? "заказ" : "заказов"} · А4, без полей браузера («Колонтитулы» — выключить)
      </span>
      <button type="button" className="btn btn--gold btn--sm" onClick={() => window.print()}>
        Печать
      </button>
    </div>
  );
}
