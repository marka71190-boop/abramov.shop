/**
 * Цели и электронная коммерция для Яндекс Метрики.
 * Вызывается из браузера; если Метрика не подключена или посетитель не разрешил аналитику — ничего не делает.
 */
type Ym = (id: number, method: string, ...args: unknown[]) => void;
declare global {
  interface Window {
    ym?: Ym;
    __ymId?: number;
    dataLayer?: unknown[];
  }
}

export function goal(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.ym || !window.__ymId) return;
  window.ym(window.__ymId, "reachGoal", name, params);
}

export interface EcomProduct {
  id: string;
  name: string;
  price: number; // рубли
  quantity?: number;
  variant?: string;
  category?: string;
}

/** Данные для отчётов «Электронная коммерция» в Метрике. */
export function ecommerce(action: "detail" | "add" | "remove" | "purchase", products: EcomProduct[], orderId?: string) {
  if (typeof window === "undefined" || !window.__ymId) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    ecommerce: {
      currencyCode: "RUB",
      [action]: { ...(orderId ? { actionField: { id: orderId } } : {}), products },
    },
  });
}
