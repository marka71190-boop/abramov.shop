/**
 * Локальная база для разработки без установки PostgreSQL.
 * Запуск: npm run db:local  → в .env.local укажите
 * DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres
 * Данные хранятся в папке ./data/pglite. На боевом сервере НЕ используется.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dir = process.argv[2] || "./data/pglite";
const db = await PGlite.create(dir);
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`Локальная база запущена: postgresql://postgres@127.0.0.1:5433/postgres (данные в ${dir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
