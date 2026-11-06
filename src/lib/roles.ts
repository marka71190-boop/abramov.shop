/**
 * Роли сотрудников. У человека может быть несколько ролей: например, тренер и кассир,
 * менеджер и тренер, администратор клуба и кассир.
 *
 * В базе: user.role — главная роль (самая старшая из выбранных), user.extra_roles — остальные.
 * Главная роль нужна старому коду и проверкам «владелец/менеджер»; всё, что зависит от
 * роли тренера, кассира, клуба или руководителя, проверяем через hasRole.
 * Общий файл для сервера и браузера — без серверных зависимостей.
 */
export type Role = "CUSTOMER" | "OWNER" | "MANAGER" | "DIRECTOR" | "CLUB" | "COACH" | "CASHIER";
export type StaffRole = Exclude<Role, "CUSTOMER">;

/** От старшей к младшей: старшая из выбранных становится главной */
export const STAFF_ROLES: StaffRole[] = ["OWNER", "MANAGER", "DIRECTOR", "CLUB", "COACH", "CASHIER"];

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Покупатель",
  OWNER: "Владелец",
  MANAGER: "Менеджер",
  DIRECTOR: "Руководитель",
  CLUB: "Администратор клуба",
  COACH: "Тренер",
  CASHIER: "Кассир",
};

export const ROLE_HINTS: Record<StaffRole, string> = {
  OWNER: "всё, включая настройки и финансы",
  MANAGER: "админка: заказы, каталог, склад — разделы можно ограничить",
  DIRECTOR: "только смотрит: финансы, аналитика, заказы, склад",
  CLUB: "выдача заказов и приём киёв в своём клубе",
  COACH: "свой кабинет: профиль, расписание, записи",
  CASHIER: "только касса: продажи в клубе и на турнирах",
};

type WithRoles = { role: string; extraRoles?: string[] | null };

/** Все роли человека */
export function rolesOf(u: WithRoles | null | undefined): Role[] {
  if (!u) return [];
  return [...new Set([u.role, ...(u.extraRoles ?? [])])].filter((r) => r !== "CUSTOMER") as Role[];
}

export const hasRole = (u: WithRoles | null | undefined, r: Role) => !!u && (u.role === r || !!u.extraRoles?.includes(r));

/** Что уже входит в старшую роль — отдельно хранить не нужно */
const IMPLIED: Partial<Record<StaffRole, StaffRole[]>> = {
  OWNER: ["MANAGER", "DIRECTOR", "CASHIER"],
  MANAGER: ["CASHIER"],
};

/** Выбранные роли → главная (самая старшая) и дополнительные */
export function splitRoles(list: string[]): { role: Role; extraRoles: StaffRole[] } {
  const picked = STAFF_ROLES.filter((r) => list.includes(r));
  if (!picked.length) return { role: "CUSTOMER", extraRoles: [] };
  const [main, ...rest] = picked;
  const implied = new Set(picked.flatMap((r) => IMPLIED[r] ?? []));
  return { role: main, extraRoles: rest.filter((r) => !implied.has(r)) };
}

/** Подпись ролей для списков: «Тренер, Кассир» */
export const rolesLabel = (u: WithRoles) =>
  rolesOf(u)
    .sort((a, b) => STAFF_ROLES.indexOf(a as StaffRole) - STAFF_ROLES.indexOf(b as StaffRole))
    .map((r) => ROLE_LABELS[r])
    .join(", ");
