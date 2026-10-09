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
  email: "oplatyabramovshop@gmail.com",
} as const;

/**
 * Служебная почта для входа через VK без указанной почты.
 * Такой адрес никуда не пишет — в кабинете клиента просим указать настоящий (для чеков).
 */
const PLACEHOLDER_DOMAIN = "no-email.abramov.shop";
export const placeholderEmail = (provider: string, id: string | number) => `${provider}-${id}@${PLACEHOLDER_DOMAIN}`;
export const isPlaceholderEmail = (email: string | null | undefined) => !!email?.endsWith(`@${PLACEHOLDER_DOMAIN}`);
