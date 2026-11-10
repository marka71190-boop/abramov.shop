"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { goal } from "@/lib/track";
import { ShareIcon } from "./InstallButton";
import { INSTALL_EVENT, installPrompt, isIos, isStandalone, promptInstall } from "./pwa";

const KEY_VISITS = "ab_visits";
const KEY_HIDE = "ab_install_hide";
const KEY_SHEET = "ab_install_sheet"; // большое окно уже показывали
const QUIET = ["/checkout", "/pay", "/cart", "/login", "/register", "/order", "/app", "/gift/"];

type Mode = "prompt" | "ios" | "android";

/**
 * Предложение установить приложение на телефоне.
 * Первый заход — шторка снизу: зачем приложение и как поставить (на Android — одна кнопка,
 * на iPhone — «Поделиться» → «На экран «Домой»»). Дальше — маленькая карточка не чаще раза в 3 недели.
 */
export function InstallHint() {
  const path = usePathname();
  const [mode, setMode] = useState<Mode | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    let visits = 0;
    let sheetSeen = false;
    try {
      if (!sessionStorage.getItem("ab_visit_counted")) {
        sessionStorage.setItem("ab_visit_counted", "1");
        localStorage.setItem(KEY_VISITS, String(Number(localStorage.getItem(KEY_VISITS) || 0) + 1));
      }
      visits = Number(localStorage.getItem(KEY_VISITS) || 0);
      sheetSeen = !!localStorage.getItem(KEY_SHEET);
      if (Number(localStorage.getItem(KEY_HIDE) || 0) > Date.now()) return;
    } catch {
      return;
    }
    if (isStandalone() || !window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches) return;
    const big = !sheetSeen;
    if (!big && visits < 2) return;
    const pick = (): Mode => (installPrompt() ? "prompt" : isIos() ? "ios" : "android");
    let t: ReturnType<typeof setTimeout>;
    // Ждём, пока посетитель осмотрится и закроет окно про cookie
    const tryShow = (left: number) => {
      t = setTimeout(() => {
        if (document.querySelector(".cookie, .ban, .search") && left > 0) return tryShow(left - 1);
        setSheet(big);
        setMode(pick());
        if (big) {
          try {
            localStorage.setItem(KEY_SHEET, "1");
          } catch {}
          goal("pwa_sheet_show");
        }
      }, 1500);
    };
    t = setTimeout(() => tryShow(40), big ? 4000 : 8000);
    const onChange = () => setMode((m) => (m ? pick() : m));
    const installed = () => setMode(null);
    window.addEventListener(INSTALL_EVENT, onChange);
    window.addEventListener("appinstalled", installed);
    return () => {
      clearTimeout(t);
      window.removeEventListener(INSTALL_EVENT, onChange);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // Шторка: Escape закрывает
  useEffect(() => {
    if (!sheet || !mode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide(14);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mode || QUIET.some((p) => path.startsWith(p))) return null;

  function hide(days = 21) {
    try {
      localStorage.setItem(KEY_HIDE, String(Date.now() + days * 86400_000));
    } catch {}
    setMode(null);
  }

  const install = async (from: string) => {
    goal("pwa_install_click", { from });
    const ok = await promptInstall();
    hide(ok ? 3650 : 21);
  };

  if (sheet)
    return (
      <div className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-sheet-title">
        <button type="button" className="install-sheet__backdrop" aria-label="Закрыть" onClick={() => hide(14)} />
        <div className="install-sheet__card">
          <span className="install-sheet__grip" aria-hidden />
          <div className="install-sheet__head">
            <img src="/icons/icon-192.png" alt="" width={64} height={64} />
            <div>
              <h2 id="install-sheet-title">Abramov — приложение в телефоне</h2>
              <p>Бесплатно и без App Store. Ставится за 10 секунд.</p>
            </div>
          </div>
          <ul className="install-sheet__perks">
            <li>
              <span aria-hidden>🔔</span> Статус заказа и трек-номер — уведомлением
            </li>
            <li>
              <span aria-hidden>💳</span> Бонусная карта всегда под рукой — покажите QR на кассе в клубе
            </li>
            <li>
              <span aria-hidden>⚡</span> Открывается с экрана «Домой», быстрее сайта
            </li>
          </ul>
          {mode === "prompt" && (
            <button type="button" className="btn btn--gold install-sheet__go" onClick={() => install("sheet")}>
              Установить приложение
            </button>
          )}
          {mode === "ios" && (
            <ol className="install-sheet__steps">
              <li>
                <span className="install-sheet__n">1</span>
                <span>
                  Нажмите «Поделиться» <ShareIcon /> внизу экрана
                  <small>в iOS 26 — сначала «•••» справа внизу</small>
                </span>
              </li>
              <li>
                <span className="install-sheet__n">2</span>
                <span>
                  Выберите <b>«На экран «Домой»»</b> <AddIcon />
                  <small>если не видно — пролистайте список вниз</small>
                </span>
              </li>
              <li>
                <span className="install-sheet__n">3</span>
                <span>
                  Нажмите <b>«Добавить»</b> — значок Abramov появится на экране
                </span>
              </li>
            </ol>
          )}
          {mode === "android" && (
            <ol className="install-sheet__steps">
              <li>
                <span className="install-sheet__n">1</span>
                <span>Откройте меню браузера ⋮ или ≡</span>
              </li>
              <li>
                <span className="install-sheet__n">2</span>
                <span>
                  «<b>Установить приложение</b>» или «<b>Добавить на главный экран</b>»
                </span>
              </li>
            </ol>
          )}
          <button type="button" className="btn btn--line install-sheet__later" onClick={() => hide(14)}>
            {mode === "prompt" ? "Не сейчас" : "Понятно, позже"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="install-hint" role="dialog" aria-label="Установить приложение">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="install-hint__text">
        <b>Abramov в телефоне</b>
        {mode === "ios" ? (
          <span>
            Нажмите <ShareIcon /> → «На экран «Домой»» — статус заказа придёт уведомлением
          </span>
        ) : mode === "android" ? (
          <span>Меню браузера → «Установить приложение» — статус заказа уведомлением</span>
        ) : (
          <span>Статус заказа и трек-номер — уведомлением, бонусная карта в одно касание</span>
        )}
      </div>
      {mode === "prompt" && (
        <button type="button" className="btn btn--gold btn--sm" onClick={() => install("hint")}>
          Установить
        </button>
      )}
      <button type="button" className="install-hint__close" aria-label="Не сейчас" onClick={() => hide()}>
        ×
      </button>
    </div>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden style={{ verticalAlign: "-3px" }}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
