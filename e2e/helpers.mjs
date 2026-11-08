/** Помощники автотестов: браузер, вход владельца и кассы, сканер-клавиатура, запросы к базе */
import fs from "node:fs";
import { chromium } from "playwright";
import pg from "pg";
import { E2E } from "./data.mjs";

export const B = E2E.base;

export async function browser() {
  return chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
}

/** Страница с перехватом ошибок: любая ошибка JS на странице роняет тест */
export async function page(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e)));
  p.on("dialog", (d) => d.accept());
  return p;
}

// Вход — один раз на весь прогон: сайт ограничивает число входов с одного адреса (защита от подбора),
// поэтому cookie сохраняем в файл и подставляем в новые страницы
const STATE = (who) => `e2e/.run/${who}.json`;

/** Владелец: вход по паролю через API (cookie остаётся в контексте страницы) */
export async function loginOwner(p) {
  if (fs.existsSync(STATE("owner"))) {
    await p.context().addCookies(JSON.parse(fs.readFileSync(STATE("owner"), "utf8")).cookies);
    return;
  }
  const r = await p.context().request.post(`${B}/api/auth/sign-in/email`, {
    data: { email: E2E.owner.email, password: E2E.owner.password, rememberMe: true },
    headers: { Origin: B },
  });
  if (!r.ok()) throw new Error(`вход владельца: ${r.status()} ${await r.text()}`);
  fs.writeFileSync(STATE("owner"), JSON.stringify(await p.context().storageState()));
}

/** Телефон кассы: вход через форму (один раз за прогон), открыть смену */
export async function loginKassa(p, staff = "Тестовый кассир") {
  if (fs.existsSync(STATE("kassa"))) {
    await p.context().addCookies(JSON.parse(fs.readFileSync(STATE("kassa"), "utf8")).cookies);
    await p.goto(`${B}/kassa`);
  } else {
    await p.goto(`${B}/kassa/login`);
    await p.fill("input[name=username]", E2E.kassa.login);
    await p.fill("input[type=password]", E2E.kassa.password);
    await p.click("button:has-text('Войти')");
    await p.waitForURL("**/kassa", { timeout: 15_000 });
    fs.writeFileSync(STATE("kassa"), JSON.stringify(await p.context().storageState()));
  }
  if (await p.locator("input[name=staffName]").count()) {
    await p.fill("input[name=staffName]", staff);
    await p.fill("input[name=opening]", "1000");
    await p.click("button:has-text('Открыть смену')");
  }
  await p.waitForSelector(".vpick input", { timeout: 15_000 });
}

/** Сканер-пистолет: печатает код очень быстро и жмёт Enter */
export async function wedgeScan(p, code) {
  await p.keyboard.type(code, { delay: 5 });
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
}

let pool;
export async function q(sql, params = []) {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return (await pool.query(sql, params)).rows;
}
export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

export const variant = async (slug) =>
  (await q("select v.id, v.barcode, v.sku, v.stock from product_variant v join product p on p.id = v.product_id where p.slug = $1 limit 1", [slug]))[0];
