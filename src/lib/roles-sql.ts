import { sql } from "drizzle-orm";
import { schema as s } from "@/db";
import type { Role } from "@/lib/roles";

/** Условие для запросов: у пользователя есть роль — главная или дополнительная */
export const userHasRole = (r: Role) => sql`(${s.user.role}::text = ${r} or ${r} = any(${s.user.extraRoles}))`;

/** Есть хотя бы одна из ролей */
export const userHasAnyRole = (rs: Role[]) => {
  const list = sql.join(
    rs.map((r) => sql`${r}`),
    sql`, `,
  );
  return sql`(${s.user.role}::text in (${list}) or ${s.user.extraRoles} && array[${list}]::text[])`;
};
