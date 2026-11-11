/**
 * Разделы админки: группы меню, доступ владельца и выбор разделов для каждого менеджера.
 * Общий файл для сервера и браузера — без серверных зависимостей.
 */

export type BadgeKey = "approvals" | "orders" | "returns" | "stock" | "questions" | "reviews" | "service" | "orgs" | "turnkey" | "coaches" | "health";

export interface AdminItem {
  key: string;
  href: string;
  label: string;
  exact?: boolean;
  owner?: boolean; // только владельцу — менеджеру не выдать
  badge?: BadgeKey;
  always?: boolean; // всегда доступен любому сотруднику (Обзор)
}

export interface AdminGroup {
  key: string;
  label: string;
  collapsed?: boolean; // по умолчанию свёрнута — редко нужное
  items: AdminItem[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    key: "sales",
    label: "Продажи",
    items: [
      { key: "home", href: "/admin", label: "Обзор", exact: true, always: true },
      { key: "orders", href: "/admin/orders", label: "Заказы", badge: "orders" },
      { key: "waybills", href: "/admin/waybills", label: "Накладные" },
      { key: "pos", href: "/admin/pos", label: "Касса", badge: "approvals" },
      { key: "returns", href: "/admin/returns", label: "Возвраты", badge: "returns" },
      { key: "club", href: "/club", label: "Выдача в клубах" },
    ],
  },
  {
    key: "goods",
    label: "Товары",
    items: [
      { key: "catalog", href: "/admin/catalog", label: "Каталог" },
      { key: "stock", href: "/admin/stock", label: "Склад", badge: "stock" },
      { key: "cue", href: "/admin/cue", label: "Кий на заказ", owner: true },
      { key: "passports", href: "/admin/passports", label: "Паспорта киёв" },
      { key: "gift-cards", href: "/admin/gift-cards", label: "Сертификаты", owner: true },
      { key: "promo", href: "/admin/promo", label: "Промокоды", owner: true },
    ],
  },
  {
    key: "money",
    label: "Деньги",
    items: [
      { key: "finance", href: "/admin/finance", label: "Финансы", owner: true },
      { key: "analytics", href: "/admin/analytics", label: "Аналитика", owner: true },
    ],
  },
  {
    key: "clients",
    label: "Клиенты",
    items: [
      { key: "customers", href: "/admin/customers", label: "Клиенты и сотрудники" },
      { key: "orgs", href: "/admin/orgs", label: "Организации (опт)", badge: "orgs" },
      { key: "reviews", href: "/admin/reviews", label: "Отзывы", badge: "reviews" },
      { key: "questions", href: "/admin/questions", label: "Вопросы о товарах", badge: "questions" },
      { key: "mailing", href: "/admin/mailing", label: "Рассылки", owner: true },
    ],
  },
  {
    key: "services",
    label: "Услуги",
    items: [
      { key: "service", href: "/admin/service", label: "Мастерская", badge: "service" },
      { key: "coaches", href: "/admin/coaches", label: "Тренеры", badge: "coaches" },
      { key: "turnkey", href: "/admin/turnkey", label: "Клуб под ключ", badge: "turnkey" },
      { key: "clubs", href: "/admin/clubs", label: "Клубы", owner: true },
    ],
  },
  {
    key: "site",
    label: "Сайт",
    collapsed: true,
    items: [
      { key: "home-page", href: "/admin/home", label: "Главная страница", owner: true },
      { key: "banners", href: "/admin/banners", label: "Баннеры" },
      { key: "journal", href: "/admin/journal", label: "Журнал (статьи)" },
      { key: "pages", href: "/admin/pages", label: "Страницы и документы", owner: true },
    ],
  },
  {
    key: "system",
    label: "Система",
    collapsed: true,
    items: [
      { key: "health", href: "/admin/health", label: "Состояние сайта", owner: true, badge: "health" },
      { key: "settings", href: "/admin/settings", label: "Настройки", owner: true },
      { key: "backup", href: "/admin/backup", label: "Резервные копии", owner: true },
      { key: "audit", href: "/admin/audit", label: "Журнал действий", owner: true },
      { key: "consents", href: "/admin/consents", label: "Журнал согласий", owner: true },
    ],
  },
];

export const ALL_ITEMS = ADMIN_GROUPS.flatMap((g) => g.items);

/** Разделы, которые можно выдать менеджеру (галочками в его карточке) */
export const MANAGER_ITEMS = ALL_ITEMS.filter((i) => !i.owner && !i.always);

/** Руководитель: только смотрит самое нужное — деньги, заказы, склад. Ничего не меняет */
export const DIRECTOR_KEYS = ["finance", "analytics", "orders", "pos", "stock", "returns"];
export const DIRECTOR_ITEMS = ALL_ITEMS.filter((i) => DIRECTOR_KEYS.includes(i.key));

/** Кому выбирают разделы галочками и из какого списка */
export const pickableItems = (roles: string[]) =>
  roles.includes("OWNER") ? [] : ALL_ITEMS.filter((i) => !i.always && ((roles.includes("MANAGER") && !i.owner) || (roles.includes("DIRECTOR") && DIRECTOR_KEYS.includes(i.key))));

/** Какой раздел открыт по пути страницы: самый длинный подходящий href */
export function sectionOf(rawPath: string): AdminItem | null {
  const path = rawPath.split(/[?#]/)[0];
  let best: AdminItem | null = null;
  for (const i of ALL_ITEMS) {
    const hit = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.href.length)) best = i;
  }
  return best;
}

/**
 * Может ли сотрудник открыть раздел.
 * roles — все роли человека; sections — выбор владельца; null/пусто — все разделы его ролей.
 */
export function canSee(roles: string[], sections: string[] | null | undefined, item: AdminItem) {
  if (roles.includes("OWNER")) return true;
  // Что даёт каждая роль; несколько ролей — объединяем
  const byRole = (roles.includes("MANAGER") && !item.owner) || (roles.includes("DIRECTOR") && DIRECTOR_KEYS.includes(item.key));
  if (!byRole && !(item.always && (roles.includes("MANAGER") || roles.includes("DIRECTOR")))) return false;
  if (item.always || !sections?.length) return true;
  return sections.includes(item.key);
}
