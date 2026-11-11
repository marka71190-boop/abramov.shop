/** Электронный паспорт кия: выпуск в админке → печать → проверка по QR → привязка кодом с карточки → передача новому владельцу */
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

async function signIn(p, who) {
  const r = await p.context().request.post(`${B}/api/auth/sign-in/email`, { data: { email: who.email, password: who.password }, headers: { Origin: B } });
  assert.ok(r.ok(), `вход ${who.email}: ${r.status()}`);
}

test("паспорт кия: выпуск, печать, проверка, привязка, передача", async () => {
  // 1. Менеджер выпускает паспорт
  const admin = await page(b);
  await loginOwner(admin);
  await admin.goto(`${B}/admin/passports/new`);
  await admin.fill("input[name=model]", "Кий Abramov «Классик» E2E");
  await admin.fill("textarea[name=spec]", "Длина: 160 см\nВес: 720 г");
  await admin.fill("input[name=master]", "Мастер Иван");
  await admin.click("form.panel button.btn--gold");
  await admin.waitForURL(/\/admin\/passports\/[\w-]+\?created=1/);
  await admin.getByText("Паспорт выпущен").waitFor();
  const [p] = await q(`select id, code, serial, claim_code from cue_passport where model = $1`, ["Кий Abramov «Классик» E2E"]);
  assert.match(p.serial, /^AB-\d{2}-\d{4}$/);

  // 2. Печать: карточка с кодом владельца, наклейка, QR картинкой
  await admin.goto(`${B}/print/passport/${p.id}?f=card`);
  assert.match(await admin.locator(".card").textContent(), new RegExp(p.claim_code));
  await admin.goto(`${B}/print/passport/${p.id}?f=sticker`);
  assert.match(await admin.locator(".stk").textContent(), new RegExp(p.serial));
  const png = await admin.context().request.get(`${B}/admin/passports/${p.id}/qr.png`);
  assert.equal(png.headers()["content-type"], "image/png");

  // 3. Мастерская добавляет запись
  await admin.goto(`${B}/admin/passports/${p.id}`);
  await admin.fill("input[name=text]", "Замена наклейки");
  await admin.getByRole("button", { name: "Добавить в историю" }).click();
  await admin.getByText("Запись добавлена").waitFor();

  // 4. Любой сканирует QR — видит подлинность и историю, без данных владельца
  const anon = await page(b);
  await anon.goto(`${B}/pasport/${p.code}`);
  const text = await anon.locator(".passport").textContent();
  assert.match(text, /Подлинный кий Abramov/);
  assert.match(text, new RegExp(p.serial));
  assert.match(text, /Мастер Иван/);
  assert.match(text, /Замена наклейки/);
  assert.match(text, /Это ваш кий\?/);
  assert.doesNotMatch(text, /@e2e\.test/);
  assert.equal((await q("select scans from cue_passport where id = $1", [p.id]))[0].scans, 1);

  // 5. Покупатель привязывает кий кодом с карточки: неверный — ошибка, верный — кий его
  const player = await page(b);
  await signIn(player, E2E.player);
  await player.goto(`${B}/pasport/${p.code}`);
  await player.fill('input[aria-label="Код с карточки паспорта"]', "WRONG123");
  await player.getByRole("button", { name: "Привязать" }).click();
  await player.getByText("Код не подходит").waitFor();
  await player.fill('input[aria-label="Код с карточки паспорта"]', p.claim_code);
  await player.getByRole("button", { name: "Привязать" }).click();
  await player.getByText("✓ Это ваш кий").waitFor({ timeout: 15_000 });
  const [pl] = await q(`select id from "user" where email = $1`, [E2E.player.email]);
  assert.equal((await q("select owner_id from cue_passport where id = $1", [p.id]))[0].owner_id, pl.id);
  // В кабинете — «Мои кии»
  await player.goto(`${B}/account`);
  if (player.url().includes("/consent")) {
    await player.check("input[name=pd]");
    await player.click("form button[type=submit]");
    await player.waitForURL((u) => !u.pathname.startsWith("/consent"));
    await player.goto(`${B}/account`);
  }
  await player.locator("#cues").getByText("Кий Abramov «Классик» E2E").waitFor();

  // 6. Продаёт кий: ссылка передачи → новый владелец принимает
  await player.goto(`${B}/pasport/${p.code}`);
  await player.getByRole("button", { name: "Передать новому владельцу" }).click();
  await player.locator(".passport-owner .pos-qr svg").waitFor();
  const [{ transfer_token: token }] = await q("select transfer_token from cue_passport where id = $1", [p.id]);
  assert.ok(token);
  await admin.goto(`${B}/pasport/${p.code}?t=${token}`);
  await admin.getByRole("button", { name: "Принять кий" }).click();
  await admin.getByText("теперь это ваш кий").waitFor({ timeout: 15_000 });
  const [own] = await q(`select id from "user" where email = $1`, [E2E.owner.email]);
  const after = (await q("select owner_id, transfer_token from cue_passport where id = $1", [p.id]))[0];
  assert.equal(after.owner_id, own.id);
  assert.equal(after.transfer_token, null);
  // Старая ссылка больше не работает
  await anon.goto(`${B}/pasport/${p.code}?t=${token}`);
  assert.equal(await anon.getByRole("button", { name: "Принять кий" }).count(), 0);

  for (const x of [admin, anon, player]) assert.deepEqual(x.errors, []);
});

test("регистрация киёв из каталога: модель подставляется, партия из 3 — три паспорта и печать разом", async () => {
  const admin = await page(b);
  await loginOwner(admin);
  await admin.goto(`${B}/admin/passports/new`);
  const select = admin.locator('select[aria-label="Кий из каталога"]');
  // В списке моделей — только кии, без мела
  const options = await select.locator("option").allTextContents();
  assert.ok(options.includes(E2E.products[1].name));
  assert.ok(!options.includes(E2E.products[0].name));
  await select.selectOption({ label: E2E.products[1].name });
  assert.equal(await admin.inputValue("input[name=model]"), E2E.products[1].name);
  await admin.fill("input[name=qty]", "3");
  await admin.click("form.panel button.btn--gold");
  await admin.waitForURL(/\/admin\/passports\?new=/);
  await admin.getByText("Зарегистрировано киёв: 3").waitFor();
  const rows = await q("select serial, code, claim_code from cue_passport where model = $1", [E2E.products[1].name]);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((r) => r.serial)).size, 3);
  assert.equal(new Set(rows.map((r) => r.claim_code)).size, 3);
  const href = await admin.getByRole("link", { name: "Печать всех карточек" }).getAttribute("href");
  await admin.goto(`${B}${href}`);
  assert.equal(await admin.locator(".card").count(), 3);
  await admin.goto(`${B}${href.replace("f=card", "f=sticker")}`);
  assert.equal(await admin.locator(".stk").count(), 3);
  assert.deepEqual(admin.errors, []);
});
