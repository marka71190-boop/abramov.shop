/** Касса: вход телефона кассы, сканер-пистолет, продажа за наличные; скидка сверх лимита → подтверждение менеджера */
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

test("сканер-пистолет добавляет товар, продажа за наличные списывает остаток клуба", async () => {
  const p = await page(b);
  await loginKassa(p);
  const v = await variant(E2E.products[0].slug);
  const before = (await q("select qty from club_stock where club_id = $1 and variant_id = $2", [E2E.club.id, v.id]))[0].qty;
  await p.locator("h1").click(); // курсор нигде — сканер всё равно ловится
  await wedgeScan(p, v.barcode);
  await wedgeScan(p, v.barcode);
  await p.waitForSelector(".pos-lines li");
  assert.match(await p.locator(".pos-lines").innerText(), new RegExp(E2E.products[0].name));
  assert.equal(await p.locator(".pos-qty input, .pos-qty span").first().evaluate((el) => el.value ?? el.textContent), "2");
  await p.click(".pos-total button.btn--gold");
  await p.waitForSelector(".pos-pay__ok", { timeout: 15_000 });
  const after_ = (await q("select qty from club_stock where club_id = $1 and variant_id = $2", [E2E.club.id, v.id]))[0].qty;
  assert.equal(after_, before - 2);
  assert.deepEqual(p.errors, []);
});

test("скидка сверх лимита: окно «Ждём подтверждения» → менеджер подтверждает PIN в админке → продажа проходит", async () => {
  const k = await page(b);
  await loginKassa(k);
  const v = await variant(E2E.products[0].slug);
  await wedgeScan(k, v.barcode);
  await k.waitForSelector(".pos-lines li");
  await k.getByLabel(/Скидка/).fill("20%");
  await k.locator(".pin-approve select").selectOption({ index: 1 });
  await k.click(".pos-total button.btn--gold");
  await k.waitForSelector(".approval-wait", { timeout: 15_000 });

  const o = await page(b, { viewport: { width: 1100, height: 900 } });
  await loginOwner(o);
  await o.goto(`${B}/admin/pos/approvals`);
  await o.fill("input[name=pin]", "000000");
  await o.click("button:has-text('Подтвердить')");
  await o.waitForSelector(".form-error");
  assert.match(await o.locator(".form-error").innerText(), /осталось попыток/);
  await o.fill("input[name=pin]", E2E.owner.pin);
  await o.click("button:has-text('Подтвердить')");

  await k.waitForSelector(".pos-pay__ok", { timeout: 20_000 });
  const [sale] = await q("select discount, discount_by_id from pos_sale order by created_at desc limit 1");
  assert.ok(sale.discount > 0 && sale.discount_by_id, "скидка записана с подтвердившим");
  await o.goto(`${B}/admin/pos/report?days=7`);
  assert.match(await o.locator(".stats").innerText(), /Сверх лимита/);
  assert.deepEqual([...k.errors, ...o.errors], []);
});
