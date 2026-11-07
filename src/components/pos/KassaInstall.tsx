"use client";
/** «Установить кассу на экран телефона»: Android — системное окно установки, iPhone — подсказка, как добавить */
import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "as_kassa_install_hide";

export function KassaInstall() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let off = false;
    try {
      off = localStorage.getItem(KEY) === "1";
    } catch {}
    if (standalone || off) return;
    setHidden(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const on = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  if (hidden || (!prompt && !ios)) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <div className="notice notice--muted kassa-install" style={{ margin: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span className="small">
          {prompt ? "Установите кассу на экран телефона — будет открываться сразу, без адресной строки." : "Касса на экран iPhone: «Поделиться» → «На экран „Домой“»."}
        </span>
        <span className="row" style={{ gap: 8 }}>
          {prompt && (
            <button
              type="button"
              className="btn btn--gold btn--sm"
              onClick={async () => {
                await prompt.prompt();
                await prompt.userChoice.catch(() => null);
                setPrompt(null);
                hide();
              }}
            >
              Установить
            </button>
          )}
          <button type="button" className="linklike small" onClick={hide}>
            Скрыть
          </button>
        </span>
      </div>
    </div>
  );
}
