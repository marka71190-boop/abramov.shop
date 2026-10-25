"use client";
import { useEffect, useRef } from "react";

/** Форма оплаты Робокассы: отправляется сама, кнопка — на случай, если браузер не отправил */
export function AutoSubmit({ action, fields }: { action: string; fields: Record<string, string> }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => form.current?.submit(), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <form ref={form} method="POST" action={action} acceptCharset="utf-8">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button className="btn btn--gold">Перейти к оплате</button>
    </form>
  );
}
