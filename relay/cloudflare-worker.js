/**
 * Воркер Cloudflare для Abramov Shop. Две задачи:
 *
 * 1. Релей Telegram Bot API (с российских серверов api.telegram.org часто недоступен).
 *    Переменная RELAY_KEY. На сайте: TELEGRAM_API_URL=https://<воркер>.workers.dev/<RELAY_KEY>
 *
 * 2. Мониторинг: по расписанию (Cron Trigger, например каждые 5 минут) проверяет
 *    https://abramov.shop/api/health и пишет в Telegram, если сайт или база не отвечают.
 *    Переменные: BOT_TOKEN (токен бота), ALERT_CHAT_ID (ваш Telegram ID — виден в админке → Настройки),
 *    HEALTH_URL (необязательно). Привязка KV с именем STATE (необязательно) — тогда воркер
 *    не повторяет тревогу каждые 5 минут и сообщает, когда сайт снова заработал.
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

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(monitor(env));
  },
};

async function check(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "abramov-monitor" }, signal: AbortSignal.timeout(15000), cf: { cacheTtl: 0 } });
    const data = await res.json().catch(() => null);
    if (res.status !== 200) return { ok: false, reason: `сайт ответил кодом ${res.status}` };
    if (!data?.ok) return { ok: false, reason: `сайт работает, но база недоступна${data?.hint ? `: ${data.hint}` : ""}` };
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, reason: e?.name === "TimeoutError" ? "сайт не ответил за 15 секунд" : `нет соединения (${e?.message ?? e})` };
  }
}

async function tell(env, text) {
  if (!env.BOT_TOKEN || !env.ALERT_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.ALERT_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

async function monitor(env) {
  const url = env.HEALTH_URL || "https://abramov.shop/api/health";
  let r = await check(url);
  if (!r.ok) {
    // Повторная проверка через 20 секунд — чтобы не тревожить из-за секундного сбоя или перезапуска
    await new Promise((res) => setTimeout(res, 20000));
    r = await check(url);
  }
  const kv = env.STATE;
  const now = Date.now();
  const state = kv ? JSON.parse((await kv.get("down")) || "null") : null;

  if (!r.ok) {
    if (!kv) return tell(env, `🔴 abramov.shop: ${r.reason}`);
    if (!state) {
      await kv.put("down", JSON.stringify({ since: now, alerted: now }));
      return tell(env, `🔴 abramov.shop: ${r.reason}. Проверьте Timeweb → приложение → «Логи приложения».`);
    }
    if (now - state.alerted > 30 * 60000) {
      await kv.put("down", JSON.stringify({ ...state, alerted: now }));
      return tell(env, `🔴 abramov.shop всё ещё не работает (${Math.round((now - state.since) / 60000)} мин): ${r.reason}`);
    }
    return;
  }
  if (kv && state) {
    await kv.delete("down");
    return tell(env, `🟢 abramov.shop снова работает. Простой — около ${Math.max(1, Math.round((now - state.since) / 60000))} мин.`);
  }
}
