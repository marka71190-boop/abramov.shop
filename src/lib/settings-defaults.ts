/**
 * Настройки по умолчанию. Хранятся в таблице setting (ключ "site") и меняются в админке.
 * Значения бонусов ниже — стартовые, их нужно выставить в админке → «Настройки».
 */

export type TierKey = "SILVER" | "GOLD" | "BLACK";

export interface SiteSettings {
  maintenance: boolean;
  maintenanceMessage: string;
  supportTelegram: string; // без @
  supportEmail: string;
  loyalty: {
    tiers: Record<TierKey, { percent: number; threshold: number }>; // threshold — ₽ покупок
    maxSpendPercent: number; // какую часть заказа можно оплатить бонусами
    welcomeBonus: number;
    referralBonus: number;
    birthdayBonus: number;
    expiryDays: number; // 0 — бонусы не сгорают
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  maintenance: false,
  maintenanceMessage: "Мы обновляем магазин. Совсем скоро вернёмся!",
  supportTelegram: "abramov_shop1",
  supportEmail: "oplatyabramovshop@gmail.com",
  loyalty: {
    tiers: {
      SILVER: { percent: 3, threshold: 0 },
      GOLD: { percent: 5, threshold: 30000 },
      BLACK: { percent: 7, threshold: 100000 },
    },
    maxSpendPercent: 30,
    welcomeBonus: 0,
    referralBonus: 300,
    birthdayBonus: 500,
    expiryDays: 365,
  },
};

/** Аккуратно накладывает сохранённые настройки на значения по умолчанию. */
export function mergeSettings(saved: unknown): SiteSettings {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<SiteSettings>;
  const l = (s.loyalty ?? {}) as Partial<SiteSettings["loyalty"]>;
  const t = (l.tiers ?? {}) as Partial<SiteSettings["loyalty"]["tiers"]>;
  const d = DEFAULT_SETTINGS;
  return {
    ...d,
    ...s,
    loyalty: {
      ...d.loyalty,
      ...l,
      tiers: {
        SILVER: { ...d.loyalty.tiers.SILVER, ...t.SILVER },
        GOLD: { ...d.loyalty.tiers.GOLD, ...t.GOLD },
        BLACK: { ...d.loyalty.tiers.BLACK, ...t.BLACK },
      },
    },
  };
}
