/** Приложение на телефоне: заставки iOS, предложение установить, нижнее меню, бонусная карта на кассе, вход по Face ID */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { devices } from "playwright";
import { B, browser, closeDb, loginKassa, loginOwner, page, q, variant, wedgeScan } from "./helpers.mjs";
import { E2E } from "./data.mjs";

let b;
before(async () => (b = await browser()));
after(async () => {
  await b?.close();
  await closeDb();
});

/** Как сайт подписывает QR бонусной карты (src/lib/bonus-card.ts) */
function cardToken(userId, ttlMs = 30 * 60_000) {
  const payload = `${userId}.${Math.floor((Date.now() + ttlMs) / 1000).toString(36)}`;
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(`bonus-card:${payload}`).digest("base64url").slice(0, 22);
  return `ABC.${payload}.${sig}`;
}
const ownerId = async () => (await q(`select id from "user" where email = $1`, [E2E.owner.email]))[0].id;

/** Окно про cookie закрываем, чтобы не мешало */
async function dismissCookie(p) {
  const c = p.locator(".cookie button").first();
  if (await c.isVisible().catch(() => false)) await c.click();
}

/** Кабинет требует согласия на обработку ПДн — отмечаем, если просят */
async function ensureConsent(p, base, path) {
  await p.goto(`${base}${path}`);
  if (p.url().includes("/consent")) {
    await p.check("input[name=pd]");
    await p.click("form button[type=submit]");
    await p.waitForURL((u) => !u.pathname.startsWith("/consent"), { timeout: 15_000 });
    await p.goto(`${base}${path}`);
  }
}

test("iPhone: заставки при запуске есть, при первом заходе предлагаем установить приложение — один раз", async () => {
  const p = await page(b, { ...devices["iPhone 13"] });
  await p.goto(`${B}/`);
  const splash = await p.locator('link[rel="apple-touch-startup-image"]').evaluateAll((ls) => ls.map((l) => l.getAttribute("href")));
  assert.ok(splash.length >= 20, `заставок: ${splash.length}`);
  const img = await p.context().request.get(new URL(splash[0], B).toString());
  assert.equal(img.status(), 200);
  assert.match(img.headers()["content-type"], /image\/png/);

  await dismissCookie(p);
  const sheet = p.locator(".install-sheet");
  await sheet.waitFor({ timeout: 20_000 });
  const text = await sheet.textContent();
  assert.match(text, /На экран «Домой»/);
  assert.match(text, /без App Store/);
  await p.click(".install-sheet__later");
  await sheet.waitFor({ state: "detached" });

  // Второй раз не надоедаем
  await p.reload();
  await p.waitForTimeout(7000);
  assert.equal(await p.locator(".install-sheet, .install-hint").count(), 0);
  assert.deepEqual(p.errors, []);
});

test("установленное приложение: нижнее меню, «Карта» без входа просит войти", async () => {
  const p = await page(b, { ...devices["iPhone 13"] });
  await p.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
  await p.goto(`${B}/catalog`);
  const bar = p.locator(".tabbar");
  await bar.waitFor();
  assert.equal(await bar.locator("a").count(), 5);
  assert.equal(await bar.locator("a.is-on").textContent(), "Каталог");
  assert.equal(await p.locator(".install-sheet, .install-hint").count(), 0); // приложение уже стоит
  await bar.getByText("Карта").click();
  await p.waitForURL("**/account/card");
  await p.locator(".bcard--empty").getByRole("link", { name: "Войти" }).waitFor();
  assert.deepEqual(p.errors, []);
});

test("бонусная карта: QR в кабинете, касса находит покупателя по QR и продаёт на него", async () => {
  const me = await page(b);
  await loginOwner(me);
  await ensureConsent(me, B, "/account/card");
  await me.locator(".bcard__qr svg").waitFor();
  assert.match(await me.locator(".bcard").textContent(), /бонусов/);

  const k = await page(b);
  await loginKassa(k);
  const id = await ownerId();
  // Чужая подпись и просроченный код не проходят
  await wedgeScan(k, cardToken(id).replace(/.{4}$/, "AAAA"));
  await k.locator(".pos-customer .is-loss").waitFor();
  assert.match(await k.locator(".pos-customer").textContent(), /устарел/);
  await wedgeScan(k, cardToken(id, -60_000));
  assert.match(await k.locator(".pos-customer").textContent(), /устарел/);

  const v = await variant(E2E.products[0].slug);
  await wedgeScan(k, v.barcode);
  await k.waitForSelector(".pos-lines li");
  await wedgeScan(k, cardToken(id));
  await k.locator(".pos-customer b", { hasText: "Владелец" }).waitFor();
  assert.match(await k.locator(".pos-customer").textContent(), /по карте/);
  await k.click(".pos-total button.btn--gold");
  await k.waitForSelector(".pos-pay__ok", { timeout: 15_000 });
  const [sale] = await q("select customer_id, bonus_accrued from pos_sale order by created_at desc limit 1");
  assert.equal(sale.customer_id, id);
  assert.deepEqual(k.errors, []);
  assert.deepEqual(me.errors, []);
});

test("вход по Face ID: включить в кабинете → выйти → войти одним касанием", async () => {
  const L = "http://localhost:3000"; // по адресу-IP браузер вход по Face ID не даёт
  const p = await page(b, { viewport: { width: 1280, height: 900 } });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const r = await p.context().request.post(`${L}/api/auth/sign-in/email`, {
    data: { email: E2E.owner.email, password: E2E.owner.password },
    headers: { Origin: L },
  });
  assert.ok(r.ok(), `вход: ${r.status()} ${await r.text()}`);
  await ensureConsent(p, L, "/account");
  await p.locator("#passkey").getByRole("button", { name: /Включить вход по/ }).click();
  await p.locator("#passkey .form-ok").waitFor({ timeout: 15_000 });
  const id = await ownerId();
  assert.equal((await q("select count(*)::int n from passkey where user_id = $1", [id]))[0].n, 1);
  await p.locator("#passkey .passkey-list li").first().waitFor();

  await p.context().clearCookies();
  await p.goto(`${L}/login`);
  await p.getByRole("button", { name: /Войти по/ }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
  const s = await (await p.context().request.get(`${L}/api/auth/get-session`)).json();
  assert.equal(s?.user?.email, E2E.owner.email);
  assert.deepEqual(p.errors, []);
});
