"use client";
import { useState, useTransition } from "react";
import { CountryField, type CountryValue } from "@/components/CountryField";
import type { Country } from "@/lib/countries";
import { setMyCountry } from "./actions";

export function CountryForm({ countries, code, name }: { countries: Country[]; code: string; name: string }) {
  const [value, setValue] = useState<CountryValue>({ code, name });
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = value.code !== code || (value.code === "XX" && value.name.trim() !== name);
  return (
    <form
      className="stack"
      style={{ gap: 8, flex: "1 1 260px", maxWidth: 360 }}
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => setMsg(await setMyCountry(value.code, value.name).catch(() => ({ error: "Нет связи с сервером" }))));
      }}
    >
      <CountryField countries={countries} value={value} onChange={(v) => (setValue(v), setMsg(null))} label="Страна" />
      {changed && (
        <button className="btn btn--line btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить страну"}
        </button>
      )}
      {msg?.ok && <span className="small" style={{ color: "var(--c-success)" }}>{msg.ok}</span>}
      {msg?.error && <span className="small" style={{ color: "var(--c-danger)" }}>{msg.error}</span>}
    </form>
  );
}
