/**
 * Релей для Telegram Bot API на Cloudflare Workers (бесплатно).
 * Нужен, потому что с российских серверов api.telegram.org часто недоступен.
 *
 * Переменная воркера RELAY_KEY — длинная случайная строка. Без неё в адресе релей отвечает 404,
 * поэтому чужие не смогут пользоваться им.
 * На сайте: TELEGRAM_API_URL=https://<имя>.<аккаунт>.workers.dev/<RELAY_KEY>
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, key, ...rest] = url.pathname.split("/");
    if (!env.RELAY_KEY || key !== env.RELAY_KEY || !rest[0]?.startsWith("bot")) {
      return new Response("Not found", { status: 404 });
    }
    const target = `https://api.telegram.org/${rest.join("/")}${url.search}`;
    return fetch(target, {
      method: request.method,
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    });
  },
};
