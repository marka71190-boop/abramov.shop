"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { goal } from "@/lib/track";
import { ShareIcon } from "./InstallButton";
import { INSTALL_EVENT, installPrompt, isIos, isStandalone, promptInstall } from "./pwa";

const KEY_VISITS = "ab_visits";
const KEY_HIDE = "ab_install_hide";
const QUIET = ["/checkout", "/pay", "/cart", "/login", "/register", "/order"];

/** Ненавязчивая карточка на телефоне: «Установите приложение». Со второго визита, закрывается на 30 дней */
export function InstallHint() {
  const path = usePathname();
  const [mode, setMode] = useState<"prompt" | "ios" | null>(null);

  useEffect(() => {
    let visits = 0;
    try {
      if (!sessionStorage.getItem("ab_visit_counted")) {
        sessionStorage.setItem("ab_visit_counted", "1");
        localStorage.setItem(KEY_VISITS, String(Number(localStorage.getItem(KEY_VISITS) || 0) + 1));
      }
      visits = Number(localStorage.getItem(KEY_VISITS) || 0);
      if (Number(localStorage.getItem(KEY_HIDE) || 0) > Date.now()) return;
    } catch {
      return;
    }
    if (visits < 2 || isStandalone() || !window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches) return;
    const decide = () => setMode(installPrompt() ? "prompt" : isIos() ? "ios" : null);
    const t = setTimeout(decide, 8000);
    window.addEventListener(INSTALL_EVENT, decide);
    return () => {
      clearTimeout(t);
      window.removeEventListener(INSTALL_EVENT, decide);
    };
  }, []);

  if (!mode || QUIET.some((p) => path.startsWith(p))) return null;
  // Не перекрываем выбор про cookie
  if (typeof document !== "undefined" && document.querySelector(".cookie")) return null;

  const hide = (days = 30) => {
    try {
      localStorage.setItem(KEY_HIDE, String(Date.now() + days * 86400_000));
    } catch {}
    setMode(null);
  };

  return (
    <div className="install-hint" role="dialog" aria-label="Установить приложение">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="install-hint__text">
        <b>Abramov в телефоне</b>
        {mode === "ios" ? (
          <span>
            Нажмите <ShareIcon /> → «На экран «Домой»» — статус заказа придёт уведомлением
          </span>
        ) : (
          <span>Статус заказа и трек-номер — уведомлением, каталог в одно касание</span>
        )}
      </div>
      {mode === "prompt" && (
        <button
          type="button"
          className="btn btn--gold btn--sm"
          onClick={async () => {
            goal("pwa_install_click", { from: "hint" });
            const ok = await promptInstall();
            hide(ok ? 3650 : 30);
          }}
        >
          Установить
        </button>
      )}
      <button type="button" className="install-hint__close" aria-label="Не сейчас" onClick={() => hide()}>
        ×
      </button>
    </div>
  );
}
