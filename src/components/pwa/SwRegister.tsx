"use client";
import { useEffect } from "react";
import { goal } from "@/lib/track";
import { INSTALL_EVENT, isStandalone } from "./pwa";

/** Подключает сервис-воркер и запоминает предложение браузера «Установить приложение» */
export function SwRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // своё окно покажем сами, в подходящий момент
      window.__abInstall = e as NonNullable<Window["__abInstall"]>;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    const onInstalled = () => {
      window.__abInstall = null;
      window.dispatchEvent(new Event(INSTALL_EVENT));
      goal("pwa_installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const secure = location.protocol === "https:" || location.hostname === "localhost";
    if ("serviceWorker" in navigator && secure) {
      const reg = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[sw]", e));
      if (document.readyState === "complete") reg();
      else window.addEventListener("load", reg, { once: true });
    }
    try {
      if (isStandalone() && !sessionStorage.getItem("ab_pwa_open")) {
        sessionStorage.setItem("ab_pwa_open", "1");
        goal("pwa_open");
      }
    } catch {}
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
