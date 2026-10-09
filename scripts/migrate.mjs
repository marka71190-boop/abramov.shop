/**
 * Применяет SQL-миграции из папки /drizzle к базе DATABASE_URL.
 * Локально: npm run db:migrate. На сервере запускается сам при каждом старте контейнера.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Не задан DATABASE_URL — укажите строку подключения к базе в переменных окружения");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR || "./drizzle" });
  console.log("Миграции применены");
} catch (e) {
  console.error("Ошибка миграции:", e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
