export type OrderStatus = "AWAITING_PAYMENT" | "PAID" | "ASSEMBLING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";

export const ORDER_STATUS: Record<OrderStatus, { text: string; tone: "dim" | "gold" | "ok" | "bad" }> = {
  AWAITING_PAYMENT: { text: "Ожидает оплаты", tone: "dim" },
  PAID: { text: "Оплачен", tone: "gold" },
  ASSEMBLING: { text: "Собираем", tone: "gold" },
  SHIPPED: { text: "В пути · СДЭК", tone: "gold" },
  DELIVERED: { text: "Получен", tone: "ok" },
  CANCELLED: { text: "Отменён", tone: "bad" },
  REFUNDED: { text: "Деньги возвращены", tone: "bad" },
};

export const TONE_COLOR = { dim: "var(--c-dim)", gold: "var(--c-gold)", ok: "var(--c-success)", bad: "var(--c-danger)" } as const;
export const TONE_PILL = { dim: "", gold: "pill--warn", ok: "pill--ok", bad: "pill--bad" } as const;

/** Шаги для полоски прогресса заказа. */
export const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "PAID", label: "Оплачен" },
  { key: "ASSEMBLING", label: "Собираем" },
  { key: "SHIPPED", label: "В пути" },
  { key: "DELIVERED", label: "Получен" },
];
