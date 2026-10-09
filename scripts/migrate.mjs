/**
 * Применяет SQL-миграции из папки /drizzle к базе DATABASE_URL.
 * Локально: npm run db:migrate. На сервере запускается сам при каждом старте контейнера.
 * Пишет в лог, куда подключается (без пароля), и понятную причину, если не получилось.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[база] Не задан DATABASE_URL — добавьте строку подключения в переменные приложения");
  process.exit(1);
}

let where = "";
try {
  const u = new URL(url);
  where = `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)} как ${decodeURIComponent(u.username)}, sslmode=${u.searchParams.get("sslmode") || "нет"}`;
} catch {
  console.error(
    "[база] DATABASE_URL не читается как адрес. Частая причина — в пароле есть символы @ : / ? # %. Смените пароль на латиницу и цифры.",
  );
  process.exit(1);
}
console.log(`[база] Подключаюсь: ${where}`);
if ((url.match(/@/g) || []).length > 1 || url.includes("#")) {
  console.error("[база] ВНИМАНИЕ: в пароле, похоже, есть символы @ или # — строка читается неправильно. Смените пароль на латиницу и цифры.");
}

const HINTS = {
  ENOTFOUND: "адрес базы не найден — проверьте хост в DATABASE_URL",
  EAI_AGAIN: "адрес базы не найден — проверьте хост в DATABASE_URL",
  ECONNREFUSED: "база не принимает подключения на этом адресе и порту",
  ETIMEDOUT: "база не отвечает — проверьте, что у базы включён публичный доступ / домен, или что приложение в той же приватной сети",
  "28P01": "неверный пароль пользователя базы",
  "28000": "пользователю запрещено подключаться к этой базе",
  "3D000": "базы с таким именем нет — проверьте имя после последнего / в DATABASE_URL",
  SELF_SIGNED_CERT_IN_CHAIN: "сертификат базы не прошёл проверку — сертификат Timeweb не подключился",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "сертификат базы не прошёл проверку — сертификат Timeweb не подключился",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "сертификат базы не прошёл проверку — сертификат Timeweb не подключился",
  ERR_TLS_CERT_ALTNAME_INVALID: "имя в сертификате не совпадает с адресом — подключайтесь по домену *.twc1.net, а не по IP",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR || "./drizzle" });
    await pool.end();
    console.log("[база] Миграции применены");
    process.exit(0);
  } catch (e) {
    lastError = e?.cause ?? e;
    await pool.end().catch(() => {});
    const code = lastError?.code;
    console.error(`[база] Попытка ${attempt} из 3 не удалась: ${HINTS[code] ?? lastError?.message ?? lastError} ${code ? `(${code})` : ""}`);
    if (["28P01", "28000", "3D000"].includes(code)) break; // повторять бессмысленно
    if (attempt < 3) await sleep(5_000);
  }
}
console.error("[база] Не удалось подготовить базу:", lastError?.message ?? lastError);
process.exit(1);
