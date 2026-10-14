"use client";
import { useEffect } from "react";
import { ecommerce, goal } from "@/lib/track";

/** Покупка для Метрики — один раз на заказ (повторное открытие страницы не считается). */
export function PurchaseTracker({ number, total, items }: { number: string; total: number; items: { id: string; name: string; price: number; quantity: number }[] }) {
  useEffect(() => {
    const key = `as_purchase_${number}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    // Метрика могла ещё не загрузиться — даём ей секунду
    const t = setTimeout(() => {
      ecommerce("purchase", items, number);
      goal("purchase", { order_price: total / 100, currency: "RUB" });
    }, 1200);
    return () => clearTimeout(t);
  }, [number, total, items]);
  return null;
}
