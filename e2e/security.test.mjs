/** Защита сайта: заголовки браузера, отсев сканеров, лимит попыток входа, вход с нового устройства и «Это был не я» */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { B, browser, closeDb, page, q } from "./helpers.mjs";
import { E2E } from "./data.mjs";

let b;

/** Письмо из заглушки почты: тема и части base64 → обычный текст */
function decode(m) {
  const parts = [...m.raw.matchAll(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g)].map((x) => Buffer.from(x[1].replace(/\s+/g, ""), "base64").toString("utf8"));
  const subject = [...m.raw.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((x) => Buffer.from(x[1], "base64").toString("utf8")).join("");
  return { ...m, text: `${subject}\n${parts.join("\n")}` };
}
before(async () => (b = await browser()));
after(async () => {
  await b?.close();
  await closeDb();
});

test("заголовки защиты и отсев сканеров", async () => {
  const p = await page(b);
  const r = await p.context().request.get(`${B}/`);
  const h = r.headers();
  assert.match(h["strict-transport-security"] ?? "", /max-age=31536000/);
  assert.match(h["content-security-policy"] ?? "", /frame-ancestors 'self'/);
  assert.match(h["content-security-policy"] ?? "", /object-src 'none'/);
  assert.match(h["content-security-policy-report-only"] ?? "", /report-uri \/api\/csp-report/);
  assert.match(h["permissions-policy"] ?? "", /camera=\(self\)/);
  // Сканеры ищут чужие движки и файлы с ключами — сразу 404
  for (const path of ["/.env", "/wp-login.php", "/.git/config", "/phpmyadmin/", "/backup.sql"]) {
    assert.equal((await p.context().request.get(`${B}${path}`)).status(), 404, path);
  }
  // «Отмычка» к серверным действиям с мусорным идентификатором — 400, до разбора Next.js
  const probe = await p.context().request.post(`${B}/`, { headers: { "Next-Action": "x", "Content-Type": "text/plain" }, data: "[]" });
  assert.equal(probe.status(), 400);
  // Отчёт о нарушении политики принимается
  const rep = await p.context().request.post(`${B}/api/csp-report`, {
    headers: { "Content-Type": "application/csp-report" },
    data: JSON.stringify({ "csp-report": { "document-uri": `${B}/catalog`, "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" } }),
  });
  assert.equal(rep.status(), 204);
});

test("подбор пароля: после 10 неверных попыток с одного адреса — 429", async () => {
  const p = await page(b);
  const ip = "203.0.113.77";
  const codes = [];
  for (let i = 0; i < 11; i++) {
    const r = await p.context().request.post(`${B}/api/auth/sign-in/email`, {
      data: { email: E2E.owner.email, password: `wrong-${i}` },
      headers: { Origin: B, "X-Forwarded-For": ip },
    });
    codes.push(r.status());
  }
  assert.ok(codes.slice(0, 10).every((c) => c === 401 || c === 400), `первые 10 — неверный пароль: ${codes}`);
  assert.equal(codes[10], 429, `11-я попытка заблокирована: ${codes}`);
  // С другого адреса — можно (лимит по адресу, а не на весь сайт)
  const other = await p.context().request.post(`${B}/api/auth/sign-in/email`, {
    data: { email: E2E.owner.email, password: E2E.owner.password },
    headers: { Origin: B, "X-Forwarded-For": "203.0.113.78" },
  });
  assert.equal(other.status(), 200);
});

test("вход сотрудника с нового устройства: письмо «Это были вы?» → «Это был не я» завершает все входы", async () => {
  const [owner] = await q('select id from "user" where email = $1', [E2E.owner.email]);
  const known = await q("select count(*)::int as n from login_device where user_id = $1", [owner.id]);
  assert.ok(known[0].n >= 1, "устройства владельца уже запомнены по прошлым входам");
  const mailFile = "e2e/.run/mail.jsonl";
  const before = fs.existsSync(mailFile) ? fs.readFileSync(mailFile, "utf8").split("\n").filter(Boolean).length : 0;

  const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" });
  const r = await ctx.request.post(`${B}/api/auth/sign-in/email`, {
    data: { email: E2E.owner.email, password: E2E.owner.password },
    headers: { Origin: B, "X-Forwarded-For": "198.51.100.9" },
  });
  assert.equal(r.status(), 200);
  // Письмо уходит в фоне — ждём
  let mail = null;
  for (let i = 0; i < 40 && !mail; i++) {
    await new Promise((res) => setTimeout(res, 250));
    const lines = fs.existsSync(mailFile) ? fs.readFileSync(mailFile, "utf8").split("\n").filter(Boolean).slice(before) : [];
    mail = lines.map((l) => JSON.parse(l)).map(decode).find((m) => /нового устройства/.test(m.text));
  }
  assert.ok(mail, "пришло письмо о входе с нового устройства");
  assert.match(mail.text, /Firefox · Linux, IP 198\.51\.100\.9/);
  const token = (mail.text.match(/security\/signout\/([0-9a-f]{48})/) ?? [])[1];
  assert.ok(token, "в письме ссылка «Это был не я»");
  const dev = await q("select label, ip from login_device where user_id = $1 and label like 'Firefox%'", [owner.id]);
  assert.deepEqual({ ...dev[0] }, { label: "Firefox · Linux", ip: "198.51.100.9" });

  // Повторный вход с того же устройства — без письма
  const sessionsBefore = (await q("select count(*)::int as n from session where user_id = $1", [owner.id]))[0].n;
  assert.ok(sessionsBefore >= 2);
  const p = await ctx.newPage();
  await p.goto(`${B}/security/signout/${token}`);
  await p.click("button:has-text('Это был не я')");
  await p.waitForSelector("text=все входы в аккаунт завершены");
  assert.equal((await q("select count(*)::int as n from session where user_id = $1", [owner.id]))[0].n, 0, "все сеансы завершены");
  await ctx.close();
  // Следующие тесты войдут заново
  fs.rmSync("e2e/.run/owner.json", { force: true });
});
