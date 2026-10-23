"use client";
import { useEffect } from "react";

export function InvoiceBar({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 400);
  }, [auto]);
  return (
    <div className="print-bar no-print">
      <span>Счёт на оплату · чтобы получить PDF, выберите «Сохранить как PDF» в окне печати</span>
      <button type="button" className="btn btn--gold btn--sm" onClick={() => window.print()}>
        Печать / PDF
      </button>
    </div>
  );
}
