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
  assert.equal((await q("select count(*)::int as n from product_image where product_id = $1", [mel.id]))[0].n, 2, "у товара не было фото — взяли два у поставщика");
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

test("новый товар с Фортуны: две карточки поставщика → один товар с вариантами, у каждого своё описание, цена и фото", async () => {
  const p = await page(b, { viewport: { width: 1200, height: 900 } });
  await loginOwner(p);
  await q("delete from product where name like 'Наклейка для кия Тест Black%'");
  await p.goto(`${B}/admin/catalog/supplier/new`);
  await p.getByLabel("Что искать у поставщика").fill("Тест Black");
  await p.click("button:has-text('Найти')");
  await p.getByLabel("Наклейка для кия Тест Black ø14мм Soft 1шт.").check();
  await p.getByLabel("Наклейка для кия Тест Black ø14мм Hard 1шт.").check();
  // Общая часть названий — товар, различие — варианты
  assert.equal(await p.getByLabel("Название товара").inputValue(), "Наклейка для кия Тест Black ø14мм");
  assert.equal(await p.getByLabel("Название варианта: Наклейка для кия Тест Black ø14мм Soft 1шт.").inputValue(), "Soft");
  await p.click("button:has-text('Создать товар с вариантами')");
  await p.waitForSelector("text=Создано черновиков: 1", { timeout: 60_000 });

  const [prod] = await q("select id, slug, price, visibility, description from product where name = 'Наклейка для кия Тест Black ø14мм'");
  assert.equal(prod.visibility, "DRAFT");
  assert.equal(prod.price, 150000, "цена — меньшая из рекомендованных");
  assert.match(prod.description, /8 слоёв/, "общее описание — из того, что совпадает у обоих");
  assert.doesNotMatch(prod.description, /Мягкая|Жёсткая/, "жёсткость у вариантов разная — в общем описании её нет");
  const vars = await q("select id, name, price, description, sku from product_variant where product_id = $1 order by sort_order", [prod.id]);
  assert.deepEqual(vars.map((v) => [v.name, v.price]), [["Soft", null], ["Hard", 170000]]);
  assert.match(vars[0].description, /Мягкая/);
  assert.match(vars[1].description, /Жёсткая/);
  const photos = await q("select variant_id from product_image where product_id = $1", [prod.id]);
  assert.equal(photos.length, 4);
  assert.ok(photos.every((x) => x.variant_id), "фото привязаны к вариантам");

  // В карточке товара описание варианта можно поправить
  await p.click("a:has-text('Открыть карточку')");
  await p.getByLabel("Описание варианта: Hard").fill("Жёсткая наклейка — своё описание.");
  await p.click("button:has-text('Сохранить')");
  await p.waitForSelector("text=Сохранено");
  assert.equal((await q("select description from product_variant where id = $1", [vars[1].id]))[0].description, "Жёсткая наклейка — своё описание.");

  // Покупатель: выбрал вариант — видит его описание
  await q("update product set visibility = 'PUBLISHED' where id = $1", [prod.id]);
  await q("update product_variant set stock = 5 where product_id = $1", [prod.id]);
  await p.goto(`${B}/product/${prod.slug}?v=${vars[0].id}`);
  assert.match(await p.locator(".pp__desc", { hasText: "Описание" }).innerText(), /Мягкая/);
  await p.locator(".variant", { hasText: "Hard" }).click();
  assert.match(await p.locator(".pp__desc", { hasText: "Описание" }).innerText(), /своё описание/);
  await q("update product set visibility = 'DRAFT' where id = $1", [prod.id]);
  assert.deepEqual(p.errors, []);
});
