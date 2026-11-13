/**
 * ЮKassa для автотестов: создаёт «платёж» и сразу отдаёт ссылку оплаты. Настоящих денег и запросов нет.
 * node e2e/mock-yookassa.mjs [порт=4010]  → YOOKASSA_API_URL=http://127.0.0.1:4010/v3
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] ?? 4010);
const payments = new Map();
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "POST" && /\/payments$/.test(req.url)) {
        const p = JSON.parse(body || "{}");
        const id = randomUUID();
        const pay = { id, status: "pending", paid: false, amount: p.amount, metadata: p.metadata ?? {}, created_at: new Date().toISOString(), confirmation: { type: "redirect", confirmation_url: `http://127.0.0.1:${port}/pay/${id}` } };
        payments.set(id, pay);
        return send(200, pay);
      }
      // Сайт поставщика (как fortu.ru): поиск по названию, переход по коду, карточка с характеристиками
      if (req.url.startsWith("/fortu/")) {
        const html = (code, text, headers = {}) => (res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", ...headers }), res.end(text));
        const card = (title, code, rrp, specs) =>
          `<html><body><div class="product-name">\n<h1>${title}</h1></div>Код товара: <span class="product_code_by_font">${code}</span>` +
          `<h3>Рекомендованная розничная цена: <div style="display:inline;">${rrp}</div> <span class="rub">&#8381;</span></h3><div class="key-propertys">` +
          specs.map(([n, v]) => `<div class="key-propertys-row"><span class="key-propertys-name">${n}</span>\n<span class="key-propertys-value">${v}</span></div>`).join("") +
          `</div><h2 class="p_h2">Подробное описание</h2><div class="clear_styles">ЧУЖОЙ ТЕКСТ ПОСТАВЩИКА — копировать нельзя</div></body></html>`;
        const tile = (path, title) => `<a href="${path}" title="${title}" class="product-image" style="display: block;"><img src="/x.jpg" /></a>`;
        const path = decodeURIComponent(req.url.slice("/fortu".length));
        if (path === "/product/mel_e2e")
          return html(200, card("Мел тестовый E2E 1шт.", "00777", "550", [["Бренд", "Taom (Финляндия)"], ["Страна производства", "Финляндия"], ["Цвет", "Green (зеленый)"], ["Вес брутто", "45 г"], ["Упаковка", "коробка картонная"], ["Особенность", "не пачкает сукно"], ["Форма", "круглая"]]));
        if (path === "/product/kiy_e2e")
          return html(200, card("Кий Fortuna Тест 2PC Пирамида", "12345", "30 000", [["Длина", "160 см"], ["Вес кия", "700 г"], ["Кол-во частей", "2РС (2-х составной)"], ["Материал шафта", "канадский клен"], ["Тип игры", "пирамида"]]));
        if (path === "/search/12345") return html(302, "", { Location: "http://fortu.ru/product/kiy_e2e" });
        if (path === "/search/Мел тестовый E2E") return html(200, `<div class="products-found">${tile("/product/mel_other", "Мел другой Blue 12шт.")}${tile("/product/mel_e2e", "Мел тестовый E2E 1шт.")}</div>`);
        if (path.startsWith("/search/")) return html(200, "<div>По данному запросу ничего не найдено...</div>");
        return html(404, "404");
      }
      // Курсы ЦБ для счёта в валюте (как https://www.cbr.ru/scripts/XML_daily.asp)
      if (req.method === "GET" && req.url.startsWith("/cbr")) {
        res.writeHead(200, { "Content-Type": "application/xml" });
        return res.end(
          '<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="10.11.2026" name="Foreign Currency Market">' +
            '<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Dollar</Name><Value>90,5000</Value></Valute>' +
            '<Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Euro</Name><Value>98,1000</Value></Valute>' +
            '<Valute ID="R01335"><NumCode>398</NumCode><CharCode>KZT</CharCode><Nominal>100</Nominal><Name>Tenge</Name><Value>18,5000</Value></Valute></ValCurs>',
        );
      }
      if (req.method === "GET" && /\/payments(\?|$)/.test(req.url)) return send(200, { type: "list", items: [...payments.values()].slice(-1) }); // сторож сайта
      const m = /\/payments\/([\w-]+)/.exec(req.url);
      if (req.method === "GET" && m) return payments.has(m[1]) ? send(200, payments.get(m[1])) : send(404, { type: "error", code: "not_found" });
      if (req.method === "GET" && req.url.startsWith("/pay/")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end("<h1>Тестовая оплата ЮKassa</h1>");
      }
      send(404, { type: "error" });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`[yookassa] :${port}`));
