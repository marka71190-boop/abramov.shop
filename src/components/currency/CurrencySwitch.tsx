"use client";
/**
 * Переключатель валюты цен в шапке: рубли, доллары, евро и валюты стран, куда возим.
 * Есть, только когда включены заказы из-за рубежа и есть курсы ЦБ. Только показ — платят в долларах.
 */
import { useEffect, useState } from "react";
import { currencyName, signOf } from "@/lib/currency";
import { currencyEnabled, getCurrency, onCurrency, setCurrency, type ShowCurrency } from "./store";

export function CurrencySwitch({ options }: { options: string[] }) {
  const [on, setOn] = useState(false);
  const [cur, setCur] = useState<ShowCurrency>("RUB");
  useEffect(() => {
    setOn(currencyEnabled());
    setCur(getCurrency());
    return onCurrency(setCur);
  }, []);
  if (!on) return null;
  return (
    <label className="cur-switch" title="Валюта цен">
      <span className="sr-only">Валюта цен</span>
      <select value={cur} onChange={(e) => setCurrency(e.target.value as ShowCurrency)} aria-label="Валюта цен">
        {[...new Set([...options, cur])].map((v) => (
          <option key={v} value={v}>
            {signOf(v)} {currencyName(v)}
          </option>
        ))}
      </select>
      <span className="cur-switch__sign" aria-hidden>
        {signOf(cur).length > 2 ? cur : signOf(cur)}
      </span>
    </label>
  );
}
