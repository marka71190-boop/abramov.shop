"use client";
import { useState } from "react";

/** Поле пароля с кнопкой «показать»: чтобы не вводить вслепую, особенно с телефона */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pwd">
      <input {...props} type={shown ? "text" : "password"} className={`input ${props.className ?? ""}`.trim()} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pwd__eye" onClick={() => setShown((v) => !v)} aria-label={shown ? "Скрыть пароль" : "Показать пароль"} aria-pressed={shown} title={shown ? "Скрыть пароль" : "Показать пароль"}>
        {shown ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.2 6.2A16.6 16.6 0 0 0 2.5 12s3.5 7 9.5 7a9.8 9.8 0 0 0 4.3-1" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
