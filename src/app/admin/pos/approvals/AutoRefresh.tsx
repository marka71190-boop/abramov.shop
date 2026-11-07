"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Новые запросы появляются сами: обновляем страницу раз в 5 секунд, пока она открыта и не вводят PIN */
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.value !== "";
      if (document.visibilityState === "visible" && !typing) router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
