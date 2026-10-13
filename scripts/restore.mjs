/**
 * Восстановление базы из резервной копии (админка → «Резервные копии»).
 *
 *   DATABASE_URL=postgresql://… node scripts/restore.mjs abramov-shop-backup-….json.gz [--force]
 *
 * Перед восстановлением структура базы должна быть создана: npm run db:migrate.
 * Если в базе уже есть данные, нужен флаг --force — тогда текущие данные будут ЗАМЕНЕНЫ копией.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";

const file = process.argv[2];
const force = process.argv.includes("--force");
if (!file) {
  console.error("Укажите файл: node scripts/restore.mjs копия.json.gz [--force]");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Не задан DATABASE_URL");
  process.exit(1);
}

const raw = readFileSync(file);
const backup = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
if (backup.format !== "abramov-shop-backup") {
  console.error("Это не резервная копия Abramov Shop");
  process.exit(1);
}
const order = Object.keys(backup.tables);
console.log(`Копия от ${backup.createdAt}:`, backup.counts);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(`select count(*)::int as n from "user"`);
  if (rows[0].n > 0 && !force) {
    console.error(`В базе уже ${rows[0].n} пользователей. Чтобы заменить данные копией, добавьте --force`);
    process.exit(2);
  }
  await client.query("begin");
  // Очищаем в обратном порядке (из-за связей между таблицами), плюс сессии
  for (const t of ["session", "verification", ...[...order].reverse()]) await client.query(`delete from "${t}"`);
  for (const t of order) {
    const list = backup.tables[t];
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      await client.query(`insert into "${t}" select * from jsonb_populate_recordset(null::"${t}", $1::jsonb)`, [JSON.stringify(chunk)]);
    }
    console.log(`  ${t}: ${list.length}`);
  }
  await client.query("commit");
  console.log("Готово: база восстановлена из копии.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Ошибка, ничего не изменено:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
