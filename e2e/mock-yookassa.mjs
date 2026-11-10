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
