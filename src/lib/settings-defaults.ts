/**
 * Настройки по умолчанию. Хранятся в таблице setting (ключ "site") и меняются в админке.
 * Значения бонусов ниже — стартовые, их нужно выставить в админке → «Настройки».
 */

export type TierKey = "SILVER" | "GOLD" | "BLACK";

export interface SiteSettings {
  maintenance: boolean;
  maintenanceMessage: string;
  /** Пауза сбора персональных данных: закрыты регистрация и оформление заказов, каталог открыт */
  pdPause: boolean;
  pdPauseMessage: string;
  supportTelegram: string; // без @
  supportEmail: string;
  loyalty: {
    tiers: Record<TierKey, { percent: number; threshold: number }>; // threshold — ₽ покупок
    maxSpendPercent: number; // какую часть заказа можно оплатить бонусами
    welcomeBonus: number;
    referralBonus: number;
    birthdayBonus: number;
    birthdayDays: number; // сколько дней действуют бонусы ко дню рождения
    reviewBonus: number; // за одобренный отзыв о купленном товаре
    expiryDays: number; // 0 — бонусы не сгорают
  };
  delivery: {
    pvzEnabled: boolean; // до пункта выдачи СДЭК
    courierEnabled: boolean; // курьером СДЭК до двери
    fromCityCode: number; // код города отправки в СДЭК (Краснодар — 435)
    shipmentPoint: string; // ПВЗ, где сдаём посылки (KSD47)
    tariffPvz: number; // 136 — посылка склад-склад
    tariffCourier: number; // 137 — посылка склад-дверь
    markup: number; // ₽ к цене СДЭК (упаковка)
    freeFrom: number; // ₽, с какой суммы доставка бесплатная; 0 — никогда
    flatPvz: number; // ₽, если СДЭК ещё не подключён
    flatCourier: number;
    pickupEnabled: boolean; // самовывоз из клубов
    pickupStorageDays: number; // сколько дней заказ ждёт в клубе
  };
  checkout: {
    paymentMinutes: number; // сколько ждём оплату, потом заказ отменяется и товар возвращается в продажу
    maxQtyPerItem: number;
    notice: string; // объявление на странице оформления
    abandonedHours: number; // через сколько часов напомнить о брошенной корзине; 0 — не напоминать
    abandonedPromoHours: number; // через сколько часов прислать персональный промокод на корзину; 0 — не присылать
    abandonedPromoPercent: number; // скидка по нему, %
    abandonedPromoValidHours: number; // сколько часов он действует
    abandonedPromoFreeShipBelow: number; // ₽: корзина меньше — вместо скидки бесплатная доставка; 0 — всегда скидка
    abandonedPromoSkipBuyersDays: number; // не давать скидку тем, кто покупал за столько дней; 0 — давать всем
  };
  stock: {
    lowThreshold: number; // предупреждать, когда остаток варианта не больше; 0 — не предупреждать
  };
  service: {
    enabled: boolean; // приём заявок в мастерскую на сайте
    cdekAddress: string; // куда присылать кий СДЭК: получатель, город, адрес или пункт
    intro: string; // текст на странице мастерской
  };
  reviews: {
    requestDays: number; // через сколько дней после получения попросить отзыв письмом; 0 — не просить
  };
  b2b: {
    enabled: boolean; // приём заявок от организаций и оптовый каталог
    intro: string; // текст на странице «Опт для клубов и бизнеса»
    invoiceDays: number; // сколько дней ждём оплату по счёту, потом заказ отменяется
    minOrder: number; // ₽, минимальная сумма оптовых товаров в заказе; 0 — без минимума
    // Реквизиты для счёта
    bankName: string;
    bik: string;
    account: string; // расчётный счёт
    corrAccount: string;
    vatNote: string; // «Без НДС» или «В т. ч. НДС 5 %»
  };
  giftCards: {
    enabled: boolean; // продажа сертификатов на сайте
    nominals: number[]; // ₽
    customMin: number; // ₽, своя сумма; 0 — своей суммы нет
    customMax: number;
    validityDays: number; // 0 — бессрочно
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  maintenance: false,
  maintenanceMessage: "Мы обновляем магазин. Совсем скоро вернёмся!",
  pdPause: false,
  pdPauseMessage: "Приём заказов и регистрация временно приостановлены. Каталог открыт — скоро снова начнём принимать заказы.",
  supportTelegram: "abramov_shop1",
  supportEmail: "shop@abramov.shop",
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
    birthdayDays: 14,
    reviewBonus: 50,
    expiryDays: 365,
  },
  delivery: {
    pvzEnabled: true,
    courierEnabled: true,
    fromCityCode: 435,
    shipmentPoint: "KSD47",
    tariffPvz: 136,
    tariffCourier: 137,
    markup: 0,
    freeFrom: 0,
    flatPvz: 350,
    flatCourier: 600,
    pickupEnabled: true,
    pickupStorageDays: 7,
  },
  checkout: {
    paymentMinutes: 60,
    maxQtyPerItem: 10,
    notice: "",
    abandonedHours: 3,
    abandonedPromoHours: 24,
    abandonedPromoPercent: 10,
    abandonedPromoValidHours: 48,
    abandonedPromoFreeShipBelow: 3000,
    abandonedPromoSkipBuyersDays: 30,
  },
  stock: {
    lowThreshold: 3,
  },
  reviews: {
    requestDays: 5,
  },
  service: {
    enabled: true,
    cdekAddress: "",
    intro: "Замена наклейки, ремонт и реставрация киёв в мастерской Abramov. Принесите кий в любой наш клуб или пришлите СДЭК — вернём как новый.",
  },
  b2b: {
    enabled: true,
    intro: "Оптовые цены для бильярдных клубов, магазинов и тренеров. Оставьте заявку — проверим организацию и откроем оптовый каталог.",
    invoiceDays: 5,
    minOrder: 0,
    bankName: "",
    bik: "",
    account: "",
    corrAccount: "",
    vatNote: "Без НДС",
  },
  giftCards: {
    enabled: true,
    nominals: [3000, 5000, 10000],
    customMin: 1000,
    customMax: 100000,
    validityDays: 365,
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
    delivery: { ...d.delivery, ...(s.delivery ?? {}) },
    checkout: { ...d.checkout, ...(s.checkout ?? {}) },
    giftCards: { ...d.giftCards, ...(s.giftCards ?? {}) },
    stock: { ...d.stock, ...(s.stock ?? {}) },
    reviews: { ...d.reviews, ...(s.reviews ?? {}) },
    service: { ...d.service, ...(s.service ?? {}) },
    b2b: { ...d.b2b, ...(s.b2b ?? {}) },
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
