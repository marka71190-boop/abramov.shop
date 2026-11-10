"use client";
/** Переключатель валюты в шапке: ₽ / $ / € / ₸. Есть, только когда включены заказы из-за рубежа и есть курсы ЦБ */
import { useEffect, useState } from "react";
import { currencyEnabled, getCurrency, onCurrency, setCurrency, type ShowCurrency } from "./store";

const OPTIONS: [ShowCurrency, string, string][] = [
  ["RUB", "₽", "Рубли"],
  ["USD", "$", "Доллары"],
  ["EUR", "€", "Евро"],
  ["KZT", "₸", "Тенге"],
];

export function CurrencySwitch() {
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
        {OPTIONS.map(([v, sign, name]) => (
          <option key={v} value={v}>
            {sign} {name}
          </option>
        ))}
      </select>
      <span className="cur-switch__sign" aria-hidden>
        {OPTIONS.find((o) => o[0] === cur)?.[1]}
      </span>
    </label>
  );
}
