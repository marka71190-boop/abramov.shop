/** Заполнение карточек по сайту поставщика: поиск по названию, характеристики, своё описание */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { B, browser, closeDb, loginOwner, page, q } from "./helpers.mjs";
import { E2E } from "./data.mjs";

let b;
before(async () => (b = await browser()));
after(async () => {
  await b?.close();
  await closeDb();
});

test("по поставщику: поиск находит товар по названию → характеристики и своё описание; ненайденному указываем код вручную", async () => {
  const p = await page(b, { viewport: { width: 1200, height: 900 } });
  await loginOwner(p);
  const [mel] = await q("select id from product where slug = $1", [E2E.products[0].slug]);
  const [kiy] = await q("select id from product where slug = $1", [E2E.products[1].slug]);
  await q("update product set description = '', weight_grams = 300 where id = any($1)", [[mel.id, kiy.id]]);

  await p.goto(`${B}/admin/catalog/supplier`);
  await p.click("button:has-text('Искать на fortu.ru')");
  await p.waitForSelector("text=Готово: нашли 1", { timeout: 60_000 });
  const [card] = await q("select status, code, score, rrp from supplier_card where product_id = $1", [mel.id]);
  assert.deepEqual({ ...card }, { status: "FOUND", code: "00777", score: 100, rrp: 55000 });
  assert.equal((await q("select status from supplier_card where product_id = $1", [kiy.id]))[0].status, "NONE");

  // Проверяем и заполняем уверенные
  await p.goto(`${B}/admin/catalog/supplier?f=found`);
  await p.waitForSelector("text=уверенно");
  await p.click("button:has-text('Отметить уверенные · 1')");
  await p.click("button:has-text('Заполнить отмеченные · 1')");
  await p.waitForSelector("text=Заполнено товаров: 1");
  const [prod] = await q("select description, weight_grams from product where id = $1", [mel.id]);
  assert.match(prod.description, /^Мел тестовый E2E — /, "описание начинается с нашего названия");
  assert.match(prod.description, /Taom/);
  assert.match(prod.description, /не пачкает сукно/);
  assert.match(prod.description, /— Форма: круглая/, "незнакомая характеристика — списком");
  assert.doesNotMatch(prod.description, /ЧУЖОЙ ТЕКСТ|упаковк/i, "текст поставщика и упаковка в описание не попадают");
  assert.equal(prod.weight_grams, 45, "вес для доставки — брутто от поставщика");
  const attrs = Object.fromEntries((await q("select a.key, pa.value from product_attribute pa join attribute a on a.id = pa.attribute_id where pa.product_id = $1", [mel.id])).map((r) => [r.key, r.value]));
  assert.equal(attrs.brand, "Taom");
  assert.equal(attrs.country, "Финляндия");
  assert.equal(attrs.color, "Зелёный", "«зеленый» поставщика — наш вариант «Зелёный»");
  assert.ok((await q("select options from attribute where key = 'country'"))[0].options.includes("Финляндия"), "новая страна добавлена в список");

  // Кий не нашёлся по названию — указываем код товара у поставщика
  await p.goto(`${B}/admin/catalog/supplier?f=none`);
  await p.getByLabel(`Указать товар поставщика: ${E2E.products[1].name}`).click();
  await p.getByLabel(`Ссылка или код: ${E2E.products[1].name}`).fill("12345");
  await p.click("button:has-text('Взять этот')");
  await p.waitForSelector("text=Нашли — проверьте");
  await p.goto(`${B}/admin/catalog/supplier?f=found`);
  await p.getByLabel(`Заполнить: ${E2E.products[1].name}`).check();
  await p.click("button:has-text('Заполнить отмеченные · 1')");
  await p.waitForSelector("text=Заполнено товаров: 1");
  const [cue] = await q("select description from product where id = $1", [kiy.id]);
  assert.match(cue.description, /Длина — 160 см/);
  assert.match(cue.description, /Разборный/);

  // Повторное заполнение ничего не портит: описание уже есть — не трогаем
  await q("update product set description = 'Своё описание' where id = $1", [mel.id]);
  await p.goto(`${B}/admin/catalog/supplier?f=applied`);
  await p.getByLabel(`Заполнить: ${E2E.products[0].name}`).check();
  await p.click("button:has-text('Заполнить отмеченные · 1')");
  await p.waitForSelector("text=описаний: 0");
  assert.equal((await q("select description from product where id = $1", [mel.id]))[0].description, "Своё описание");
  assert.deepEqual(p.errors, []);
});
