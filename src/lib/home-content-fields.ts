/**
 * Тексты главной страницы, которые меняются в админке (Админка → Главная страница).
 * Пустое поле — показывается текст по умолчанию. Можно импортировать и на клиенте.
 */
export const HOME_FIELDS = [
  { group: "Первый экран", key: "heroEyebrow", label: "Надпись над заголовком", def: "Abramov Shop", max: 60 },
  { group: "Первый экран", key: "heroTitle", label: "Заголовок — каждая строка с новой строки", def: "Экипировка\nдля тех, кто", max: 120, lines: 3 },
  { group: "Первый экран", key: "heroAccent", label: "Золотая строка заголовка", def: "играет на победу", max: 60 },
  {
    group: "Первый экран",
    key: "heroLead",
    label: "Текст под заголовком",
    def: "Всё для бильярда в одном месте. Доставка СДЭК по всей России, удобная оплата и бонусы с каждой покупки.",
    max: 300,
    lines: 3,
  },
  { group: "Первый экран", key: "heroButton", label: "Главная кнопка", def: "В каталог", max: 30 },
  { group: "Первый экран", key: "heroButton2", label: "Вторая кнопка", def: "Бонусная программа", max: 40 },

  { group: "Преимущества под первым экраном", key: "feat1Title", label: "1 — заголовок", def: "Доставка СДЭК", max: 40 },
  { group: "Преимущества под первым экраном", key: "feat1Text", label: "1 — текст", def: "Курьер или пункт выдачи по всей России", max: 100 },
  { group: "Преимущества под первым экраном", key: "feat2Title", label: "2 — заголовок", def: "Оплата ЮKassa", max: 40 },
  { group: "Преимущества под первым экраном", key: "feat2Text", label: "2 — текст", def: "Банковские карты и СБП, чек на почту", max: 100 },
  { group: "Преимущества под первым экраном", key: "feat3Title", label: "3 — заголовок", def: "Бонусы", max: 40 },
  { group: "Преимущества под первым экраном", key: "feat3Text", label: "3 — текст", def: "Начисляем с каждого заказа, оплачивайте ими покупки", max: 100 },

  { group: "Разделы", key: "catalogTitle", label: "Каталог — заголовок", def: "Каталог", max: 40 },
  { group: "Разделы", key: "hitsTitle", label: "Хиты — заголовок", def: "Хиты продаж", max: 40 },
  { group: "Разделы", key: "newTitle", label: "Новинки — заголовок", def: "Новинки", max: 40 },
  { group: "Разделы", key: "dropEyebrow", label: "Лимитированная серия — надпись", def: "Лимитированная серия", max: 40 },
  { group: "Разделы", key: "reviewsTitle", label: "Отзывы — заголовок", def: "Отзывы покупателей", max: 40 },
  { group: "Разделы", key: "reviewsText", label: "Отзывы — текст", def: "Оставить отзыв можно после получения заказа — за него начисляем бонусы.", max: 200, lines: 2 },
  { group: "Разделы", key: "bonusTitle", label: "Бонусы — заголовок", def: "Бонусная\nпрограмма", max: 60, lines: 2 },
  {
    group: "Разделы",
    key: "bonusText",
    label: "Бонусы — текст ({процент} — сколько заказа можно оплатить бонусами)",
    def: "Чем больше покупаете, тем выше уровень и тем больше бонусов возвращается. Бонусами можно оплатить до {процент}% следующего заказа.",
    max: 300,
    lines: 3,
  },
  { group: "Разделы", key: "supportTitle", label: "Поддержка — заголовок", def: "Есть вопрос?", max: 40 },
  { group: "Разделы", key: "supportText", label: "Поддержка — текст", def: "Поможем с выбором, заказом и доставкой. Пишите в Telegram.", max: 200, lines: 2 },
] as const;

export type HomeKey = (typeof HOME_FIELDS)[number]["key"];
export type HomeContent = Record<HomeKey, string>;

export function mergeHome(saved: unknown): HomeContent {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Record<string, unknown>>;
  const out = {} as HomeContent;
  for (const f of HOME_FIELDS) {
    const v = s[f.key];
    out[f.key] = typeof v === "string" && v.trim() ? v : f.def;
  }
  return out;
}
