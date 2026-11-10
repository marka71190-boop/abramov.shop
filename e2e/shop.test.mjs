/** Магазин: главная, каталог, товар, корзина и оформление заказа с оплатой (ЮKassa — заглушка) */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { B, browser, closeDb, loginKassa, page, q, wedgeScanKeys } from "./helpers.mjs";
import { E2E } from "./data.mjs";

let b;
before(async () => (b = await browser()));
after(async () => {
  await b?.close();
  await closeDb();
});

test("главная, каталог и страница товара открываются без ошибок", async () => {
  const p = await page(b);
  for (const url of ["/", "/catalog", `/product/${E2E.products[0].slug}`, "/cart", "/sitemap.xml", "/robots.txt"]) {
    const r = await p.goto(B + url);
    assert.equal(r.status(), 200, `${url} → ${r.status()}`);
  }
  await p.goto(`${B}/catalog`);
  assert.ok(await p.locator(`a[href="/product/${E2E.products[0].slug}"]`).count(), "товар есть в каталоге");
  assert.deepEqual(p.errors, []);
});

test("покупка: товар в корзину → оформление → переход к оплате, заказ в базе", async () => {
  const p = await page(b);
  await p.goto(`${B}/product/${E2E.products[0].slug}`);
  await p.locator("button:has-text('В корзину')").first().click();
  await p.waitForTimeout(800);
  await p.goto(`${B}/checkout`);
  await p.getByLabel("Имя и фамилия").fill("Тест Покупатель");
  await p.getByLabel("Телефон").fill("+7 900 111-22-33");
  await p.getByLabel("Почта — для чека").fill("buyer@e2e.test");
  const pass = p.getByLabel("Пароль для входа");
  if (await pass.count()) await pass.fill("buyer-pass-123");
  await p.locator("button[role=radio]:has-text('Самовывоз из клуба')").click();
  await p.locator(`button[role=radio]:has-text('${E2E.club.name}')`).click();
  // Согласия — все галочки в блоке получателя, кроме рассылки
  for (const box of await p.locator("label.check:not(:has-text('рассыл')) input[type=checkbox]").all()) if (!(await box.isChecked())) await box.check();
  const pay = p.locator("form button.btn--gold.btn--block");
  await p.waitForFunction((el) => !el.disabled, await pay.elementHandle(), { timeout: 15_000 });
  await pay.click();
  await p.waitForURL((u) => /\/pay\/|\/order\//.test(u.toString()), { timeout: 20_000 });
  const rows = await q("select number, status from \"order\" where email = $1 order by created_at desc limit 1", ["buyer@e2e.test"]);
  assert.equal(rows.length, 1, "заказ создан");
  assert.deepEqual(p.errors, []);
});

test("«Основной» вариант не показывается покупателю, если у товара есть настоящие варианты", async () => {
  const [{ id: pid }] = await q(
    "insert into product (id, name, slug, price, visibility, weight_grams, preview_token, category_id) values (gen_random_uuid()::text, 'Наклейки E2E', 'naklejki-e2e', 70000, 'PUBLISHED', 50, 'e2e-naklejki-token', (select id from category where slug = 'e2e')) returning id",
  );
  await q("insert into product_variant (id, product_id, name, stock, is_active, sort_order) values (gen_random_uuid()::text, $1, 'Основной', 0, true, 0), (gen_random_uuid()::text, $1, 'JOS PM', 5, true, 1), (gen_random_uuid()::text, $1, 'JOS H+', 4, true, 2)", [pid]);
  const p = await page(b);
  await p.goto(`${B}/product/naklejki-e2e`);
  const text = await p.locator("main").innerText();
  assert.match(text, /JOS PM/);
  assert.doesNotMatch(text, /Основной/);
  await p.goto(`${B}/catalog`);
  assert.doesNotMatch(await p.locator("main").innerText(), /Основной/);
  assert.deepEqual(p.errors, []);
});

test("выдача заказа с сайта в клубе: касса находит заказ сканером и отмечает «Выдано»", async () => {
  const [ord] = await q("select id, number from \"order\" where email = $1 order by created_at desc limit 1", ["buyer@e2e.test"]);
  await q("update \"order\" set status = 'SHIPPED', shipped_at = now() where id = $1", [ord.id]);
  const k = await page(b);
  await loginKassa(k);
  await k.locator("h1").click();
  // Сканер-пистолет при русской раскладке печатает буквы кириллицей — касса всё равно понимает
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
  const RU = "йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ";
  const ru = [...`https://abramov.shop/order/${ord.number}`].map((c) => (EN.includes(c) ? RU[EN.indexOf(c)] : c)).join("");
  await wedgeScanKeys(k, ru);
  await k.waitForSelector(".pickup--found");
  assert.match(await k.locator(".pickup--found").innerText(), new RegExp(ord.number));
  await k.click(".pickup--found button:has-text('Выдать заказ')");
  await k.click(".pickup--found button:has-text('Да, выдал')");
  await k.waitForSelector("text=выдан");
  assert.equal((await q("select status from \"order\" where id = $1", [ord.id]))[0].status, "DELIVERED");
  assert.deepEqual(k.errors, []);
});
