"use client";
import { useEffect, useState } from "react";
import { goal } from "@/lib/track";
import { INSTALL_EVENT, installPrompt, isIos, isStandalone, promptInstall } from "./pwa";

/** Кнопка «Установить приложение» или подсказка, как это сделать в этом браузере */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"loading" | "installed" | "prompt" | "ios" | "manual">("loading");

  useEffect(() => {
    const check = () => setMode(isStandalone() ? "installed" : installPrompt() ? "prompt" : isIos() ? "ios" : "manual");
    check();
    window.addEventListener(INSTALL_EVENT, check);
    return () => window.removeEventListener(INSTALL_EVENT, check);
  }, []);

  if (mode === "loading") return null;
  if (mode === "installed") return <span className="pill pill--ok">Приложение установлено</span>;
  if (mode === "prompt")
    return (
      <button
        type="button"
        className={`btn btn--gold ${compact ? "btn--sm" : ""}`}
        onClick={async () => {
          goal("pwa_install_click");
          await promptInstall();
        }}
      >
        Установить приложение
      </button>
    );
  if (mode === "ios")
    return (
      <ol className="small install-steps">
        <li>
          Откройте сайт в <b>Safari</b>
        </li>
        <li>
          Нажмите «Поделиться» <ShareIcon /> внизу экрана
        </li>
        <li>
          Выберите <b>«На экран «Домой»»</b> и нажмите «Добавить»
        </li>
      </ol>
    );
  return (
    <ol className="small install-steps">
      <li>
        <b>Android:</b> меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран»
      </li>
      <li>
        <b>Яндекс Браузер:</b> меню ≡ → «Добавить ярлык на экран»
      </li>
      <li>
        <b>Компьютер (Chrome, Edge, Яндекс):</b> значок установки в адресной строке справа
      </li>
    </ol>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="значок «Поделиться»" style={{ verticalAlign: "-3px" }}>
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
