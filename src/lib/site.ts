/**
 * Постоянные данные магазина. То, что меняется часто (Telegram поддержки,
 * бонусы, режим техработ), настраивается в админке → «Настройки».
 */

export const SITE = {
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://abramov.shop").replace(/\/$/, ""),
  name: "Abramov Shop",
  title: "Abramov Shop — всё для бильярда",
  description:
    "Магазин Abramov Shop: бильярдный мел, кии, перчатки и аксессуары. Доставка СДЭК по всей России, оплата через ЮKassa, бонусы с каждой покупки.",
  locale: "ru_RU",
} as const;

/** Реквизиты продавца — показываются в подвале и в документах. */
export const SELLER = {
  name: "ИП Абрамова Алина Гургеновна",
  inn: "231715939839",
  ogrnip: "325237500448706",
  legalAddress: "350011, г. Краснодар, ул. Обрывная, 132/1",
  actualAddress: "350051, г. Краснодар, ул. Шоссе Нефтяников, 40",
  email: "shop@abramov.shop",
  // Латиницей — для международных отправлений (инвойс для таможни)
  nameEn: "IP Abramova Alina Gurgenovna",
  actualAddressEn: "40 Shosse Neftyanikov St., Krasnodar, 350051, Russia",
} as const;

/** Банк ИП — для счетов на оплату (не секрет: печатается в каждом счёте). Сид подставляет их в настройки, если там пусто */
export const SELLER_BANK = {
  bankName: 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
  bik: "046015207",
  account: "40802810426060011419",
  corrAccount: "30101810500000000207",
} as const;

/**
 * Служебная почта у аккаунтов, созданных входом через VK без почты (вход через VK убран, аккаунты остались).
 * Такой адрес никуда не пишет — в кабинете клиента просим указать настоящий (для чеков и входа).
 */
export const PLACEHOLDER_DOMAIN = "no-email.abramov.shop";
export const isPlaceholderEmail = (email: string | null | undefined) => !!email?.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);
