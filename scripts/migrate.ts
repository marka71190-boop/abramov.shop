/**
 * Применяет SQL-миграции из папки /drizzle к базе DATABASE_URL.
 * Запуск: npm run db:migrate (на сервере — при каждом обновлении сайта, перед npm start).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Не задан DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Миграции применены");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
