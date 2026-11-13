/** Склад: приёмка сканером (знакомый код +1, новый код → новый товар), этикетки, ревизия в клубе */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { B, browser, closeDb, loginKassa, loginOwner, page, q, variant, wedgeScan } from "./helpers.mjs";
import { E2E } from "./data.mjs";

let b;
before(async () => (b = await browser()));
after(async () => {
  await b?.close();
  await closeDb();
});

test("приёмка: сканы знакомого кода складываются, незнакомый EAN-13 → новый товар, приход проведён, этикетки", async () => {
  const p = await page(b, { viewport: { width: 1100, height: 900 } });
  await loginOwner(p);
  await p.goto(`${B}/admin/stock/move?t=RECEIPT`);
  const v = await variant(E2E.products[1].slug);
  await p.locator("h1").click();
  await wedgeScan(p, v.barcode);
  await wedgeScan(p, v.barcode);
  await wedgeScan(p, v.barcode);
  assert.equal(await p.getByLabel("Пришло, шт").first().inputValue(), "3");

  const fresh = "4601234567893"; // заводской EAN-13 с упаковки
  await wedgeScan(p, fresh);
  await p.waitForSelector(`text=Новый код`);
  await p.click("button:has-text('Новый товар')");
  await p.getByPlaceholder("Название товара").fill("Перчатка новая E2E");
  await p.getByPlaceholder("Цена продажи, ₽").fill("990");
  await p.click("button:has-text('Создать и добавить в приход')");
  await p.waitForSelector("text=Перчатка новая E2E");
  await p.click("button:has-text('Провести приход')");
  await p.waitForSelector("text=Этикетки на пришедшее");

  assert.equal((await variant(E2E.products[1].slug)).stock, v.stock + 3);
  const [n] = await q("select v.sku, v.barcode, v.stock, p.visibility from product_variant v join product p on p.id = v.product_id where v.barcode = $1", [fresh]);
  assert.deepEqual({ ...n }, { sku: fresh, barcode: fresh, stock: 1, visibility: "DRAFT" });

  const file = await p.context().request.get(`${B}/admin/stock/labels/niimbot?p=1&i=${encodeURIComponent(`${v.id}:2`)}`);
  assert.equal(file.status(), 200);
  assert.match(file.headers()["content-type"], /spreadsheet/);
  assert.deepEqual(p.errors, []);
});

test("ревизия: касса считает сканером вслепую → менеджер проводит, остаток клуба = насчитанному", async () => {
  const k = await page(b);
  await loginKassa(k, "Ревизор");
  await k.goto(`${B}/kassa/count`);
  await k.click("button:has-text('Начать или продолжить')");
  await k.waitForURL("**/kassa/count/**");
  const v = await variant(E2E.products[1].slug);
  await k.locator("h1").click();
  await wedgeScan(k, v.barcode);
  await k.waitForSelector(".count-list li");
  await k.waitForSelector("text=Сохранено");
  await k.click("button:has-text('Закончить и отправить менеджеру')");
  await k.waitForSelector("text=Отправлено менеджеру");

  const o = await page(b, { viewport: { width: 1100, height: 900 } });
  await loginOwner(o);
  const [c] = await q("select id from stock_count where status = 'SUBMITTED' order by created_at desc limit 1");
  await o.goto(`${B}/admin/stock/count/${c.id}`);
  await o.click("button:has-text('Провести ревизию')");
  // Ответ кнопки («Проведено: …») или уже обновлённая страница («Проведена …») — что успеет первым
  await o.waitForSelector(".form-ok, .form-error", { timeout: 15_000 });
  assert.match(await o.locator(".form-ok, .form-error").first().innerText(), /Проведен[оа]/);
  const rows = await q("select v.id, cs.qty from club_stock cs join product_variant v on v.id = cs.variant_id where cs.club_id = $1", [E2E.club.id]);
  assert.equal(rows.find((r) => r.id === v.id).qty, 1, "посчитанный товар — 1 шт");
  assert.ok(rows.filter((r) => r.id !== v.id).every((r) => r.qty === 0), "полный пересчёт: остальное списано");
  assert.deepEqual([...k.errors, ...o.errors], []);
});

test("перемещение списком: набрать кнопками несколько товаров со склада и отвезти в клуб одним разом", async () => {
  const p = await page(b);
  await loginOwner(p);
  await p.goto(`${B}/admin/stock/transfer?from=wh&to=${E2E.club.id}`);
  const [mel, kiy] = [await variant(E2E.products[0].slug), await variant(E2E.products[1].slug)];
  const clubQty = async (id) => (await q("select qty from club_stock where club_id = $1 and variant_id = $2", [E2E.club.id, id]))[0]?.qty ?? 0;
  const [melClub, kiyClub] = [await clubQty(mel.id), await clubQty(kiy.id)];
  // Галочка — 1 шт, дальше «+»
  await p.getByLabel(`Выбрать: ${E2E.products[0].name}`).check();
  for (let i = 0; i < 2; i++) await p.getByLabel(`Больше: ${E2E.products[0].name}`).click();
  await p.getByLabel(`Выбрать: ${E2E.products[1].name}`).check();
  await p.locator("h1").click();
  await wedgeScan(p, kiy.barcode); // сканер тоже +1
  assert.match(await p.locator(".tr-bar").innerText(), /2 поз\. · 5 шт/);
  await p.reload(); // набранное не теряется
  assert.match(await p.locator(".tr-bar").innerText(), /2 поз\. · 5 шт/);
  await p.click(".tr-bar button:has-text('Дальше')");
  assert.match(await p.locator(".tr-bar").innerText(), /5 шт/);
  await p.click(".tr-bar button:has-text('Переместить')");
  await p.waitForSelector(".form-ok");
  assert.equal((await variant(E2E.products[0].slug)).stock, mel.stock - 3);
  assert.equal((await variant(E2E.products[1].slug)).stock, kiy.stock - 2);
  assert.equal(await clubQty(mel.id), melClub + 3);
  assert.equal(await clubQty(kiy.id), kiyClub + 2);
  assert.equal(await p.locator(".tr-bar").count(), 0, "после перемещения выбор сброшен");

  // Сразу — этикетки на привезённое: открыт клуб, отмечено ровно то, что привезли
  await p.click("a:has-text('Этикетки на привезённое')");
  await p.waitForSelector("text=Отметили привезённое");
  assert.equal(await p.getByLabel(`Сколько этикеток: ${E2E.products[0].name}`).inputValue(), "3");
  assert.equal(await p.getByLabel(`Сколько этикеток: ${E2E.products[1].name}`).inputValue(), "2");
  assert.match(await p.locator("button:has-text('Файл для NIIMBOT')").textContent(), /5 шт/);
  assert.equal(await p.locator("table thead").getByText("В клубе").count(), 1);
  // «Сколько в клубе» — по остатку клуба
  await p.click("button:has-text('Сколько в клубе')");
  assert.equal(await p.getByLabel(`Сколько этикеток: ${E2E.products[0].name}`).inputValue(), String(melClub + 3));
  // Печать с подписью клуба
  const [club] = await q("select name from club where id = $1", [E2E.club.id]);
  const pr = await p.context().newPage();
  await pr.goto(`${B}/print/labels?f=50x30&p=1&q=0&c=${E2E.club.id}&i=${encodeURIComponent(`${mel.id}:1`)}`);
  assert.match(await pr.locator(".lbl__club").first().innerText(), new RegExp(club.name.slice(0, 6)));
  await pr.close();
  assert.deepEqual(p.errors, []);
});

test("этикетки: галочки — по одной, «отметить все», файл для NIIMBOT на отмеченное", async () => {
  const p = await page(b, { viewport: { width: 1100, height: 900 } });
  await loginOwner(p);
  await p.goto(`${B}/admin/stock/labels`);
  await p.getByLabel(`Выбрать: ${E2E.products[0].name}`).check();
  assert.equal(await p.getByLabel(`Сколько этикеток: ${E2E.products[0].name}`).inputValue(), "1");
  await p.getByLabel("Отметить все в списке").check();
  const total = await p.locator("button:has-text('Файл для NIIMBOT')").textContent();
  assert.match(total, /\d+ шт/);
  await p.getByLabel("Отметить все в списке").uncheck();
  assert.equal(await p.locator("button:has-text('Файл для NIIMBOT')").isDisabled(), true);
  assert.deepEqual(p.errors, []);
});

test("первая инвентаризация: всем по 100 → поправить → черновик переживает перезагрузку → сохранить", async () => {
  const p = await page(b, { viewport: { width: 1100, height: 900 } });
  await loginOwner(p);
  await p.goto(`${B}/admin/stock/move?t=INVENTORY`);
  await p.click("button:has-text('Заполнить')");
  const rows = await p.locator("table tbody tr").count();
  assert.ok(rows >= 3, "в списке все товары");
  await p.getByLabel(`Стало, шт: ${E2E.products[1].name}`).fill("7");
  await p.reload();
  assert.equal(await p.getByLabel(`Стало, шт: ${E2E.products[1].name}`).inputValue(), "7", "поправка сохранилась в черновике");
  assert.equal(await p.getByLabel(`Стало, шт: ${E2E.products[0].name}`).inputValue(), "100");
  await p.click("button:has-text('Сохранить остатки')");
  await p.waitForFunction(() => !document.querySelector("table tbody tr"), null, { timeout: 20_000 }); // сохранили — список очищен
  assert.equal((await variant(E2E.products[0].slug)).stock, 100);
  assert.equal((await variant(E2E.products[1].slug)).stock, 7);
  await p.reload();
  assert.equal(await p.locator("table tbody tr").count(), 0, "после сохранения черновик очищен");
  assert.deepEqual(p.errors, []);
});
