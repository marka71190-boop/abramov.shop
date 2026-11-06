"use client";
/** Страна доставки: Россия, страны СДЭК из списка или «моей страны нет» — вписать самому. */
import { MANUAL_CODE, type Country } from "@/lib/countries";

export interface CountryValue {
  code: string;
  name: string; // заполняется, только если code = XX
}

export function CountryField({
  countries,
  value,
  onChange,
  label = "Страна доставки",
  hint,
}: {
  countries: Country[];
  value: CountryValue;
  onChange: (v: CountryValue) => void;
  label?: string;
  hint?: string;
}) {
  const manual = value.code === MANUAL_CODE;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {!manual && (
        <label className="field">
          {label}
          <select className="input" name="country" value={value.code} onChange={(e) => onChange({ code: e.target.value, name: "" })}>
            <option value="RU">Россия</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {manual && (
        <label className="field">
          {label} — впишите сами
          <input
            className="input"
            name="countryName"
            value={value.name}
            maxLength={60}
            required
            autoComplete="country-name"
            placeholder="Например: Германия"
            onChange={(e) => onChange({ code: MANUAL_CODE, name: e.target.value })}
          />
        </label>
      )}
      <div className="row small" style={{ gap: 10, alignItems: "center", flexWrap: "nowrap" }}>
        <button
          type="button"
          className="toggle"
          aria-pressed={manual}
          aria-label="Моей страны нет в списке"
          onClick={() => onChange(manual ? { code: "RU", name: "" } : { code: MANUAL_CODE, name: "" })}
        >
          <span />
        </button>
        <span>Моей страны нет в списке</span>
      </div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
