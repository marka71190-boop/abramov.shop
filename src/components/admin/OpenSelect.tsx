"use client";
import { useState } from "react";

/**
 * Список с возможностью добавить свой вариант: мастер, порода турняка или шафта.
 * Новый вариант попадает в справочник, когда товар сохраняют.
 */
export function OpenSelect({ value, options, onChange, placeholder, addLabel }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; addLabel: string }) {
  const known = !value || options.some((o) => o.toLowerCase() === value.toLowerCase());
  const [typing, setTyping] = useState(!known);
  if (typing)
    return (
      <span className="open-select">
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={60} autoFocus={!value} />
        {options.length > 0 && (
          <button
            type="button"
            className="linklike small"
            onClick={() => {
              setTyping(false);
              if (!options.some((o) => o.toLowerCase() === value.trim().toLowerCase())) onChange("");
            }}
          >
            Выбрать из списка
          </button>
        )}
      </span>
    );
  return (
    <select
      className="select"
      value={options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new") {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__new">{addLabel}</option>
    </select>
  );
}

export const OPEN_LABEL: Record<string, { add: string; placeholder: string }> = {
  brand: { add: "+ Другой мастер…", placeholder: "Имя мастера или бренд" },
  butt: { add: "+ Другая порода…", placeholder: "Например: Кокоболо" },
  shaft: { add: "+ Другая порода…", placeholder: "Например: Клён канадский" },
};
