/**
 * Сторож сайта: замечает, что сломалось, и пишет владельцу и менеджерам в Telegram и уведомлением на телефон.
 *
 * Что проверяем:
 *   • раз в 5 минут — база, ЮKassa, СДЭК; раз в 10 — Telegram-бот; раз в 30 — почтовый сервер;
 *   • фоновые задачи: проверка оплат заказов и кассы, рассылки, сертификаты, трек-номера СДЭК;
 *   • ошибки на страницах сайта: много за 10 минут — значит, у покупателей что-то не открывается.
 *
 * Пишем, когда сбой повторился несколько раз подряд (разовые сбои связи не тревожат), напоминаем раз в 6 часов,
 * пока не починится, и сообщаем «снова работает». В сообщениях — только что и где сломалось:
 * почты, телефоны и длинные ключи из текста ошибок вырезаются.
 *
 * Если сайт упал целиком, сам он написать не сможет — для этого внешняя проверка (Яндекс Метрика → уведомления).
 */
import "server-only";

export interface CheckState {
  key: string;
  title: string;
  ok: boolean | null; // null — ещё не проверяли
  fails: number;
  failingSince: number | null;
  lastOkAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  alertedAt: number | null;
}

const CHECKS: Record<string, { title: string; threshold: number }> = {
  db: { title: "База данных", threshold: 2 },
  yookassa: { title: "Оплата через ЮKassa", threshold: 2 },
  cdek: { title: "СДЭК (доставка)", threshold: 3 },
  mail: { title: "Почта (письма покупателям)", threshold: 2 },
  telegram: { title: "Telegram-бот", threshold: 3 },
  errors: { title: "Ошибки на страницах сайта", threshold: 1 },
  "job:payments": { title: "Проверка оплат заказов", threshold: 5 },
  "job:pos": { title: "Оплаты в кассе по QR", threshold: 5 },
  "job:expire": { title: "Отмена неоплаченных заказов", threshold: 3 },
  "job:cdek": { title: "Трек-номера и статусы СДЭК", threshold: 2 },
  "job:mailing": { title: "Рассылки", threshold: 5 },
  "job:gift": { title: "Подарочные сертификаты", threshold: 3 },
  "job:service": { title: "Оплаты мастерской", threshold: 3 },
};
const titleOf = (key: string) => CHECKS[key]?.title ?? `Фоновая задача «${key.replace(/^job:/, "")}»`;
const thresholdOf = (key: string) => CHECKS[key]?.threshold ?? 3;

const REMIND_MS = 6 * 3600_000;
const ERRORS_WINDOW_MS = 10 * 60_000;
const ERRORS_ALERT = 15;

interface WatchState {
  checks: Map<string, CheckState>;
  errors: { at: number; path: string; msg: string }[];
  tick: number;
  mailAt: number;
}
const g = globalThis as unknown as { __asWatch?: WatchState };
const st: WatchState = (g.__asWatch ??= { checks: new Map(), errors: [], tick: 0, mailAt: 0 });

/** Текст ошибки без персональных данных и ключей */
export function cleanError(e: unknown) {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  return String(raw ?? "ошибка")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<почта>")
    .replace(/\+?\d[\d\s()-]{9,}\d/g, "<номер>")
    .replace(/[A-Za-z0-9_\-+/=]{28,}/g, "<ключ>")
    .replace(/https?:\/\/[^\s?]+\?\S+/g, (u) => u.split("?")[0])
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function state(key: string) {
  let s = st.checks.get(key);
  if (!s) {
    s = { key, title: titleOf(key), ok: null, fails: 0, failingSince: null, lastOkAt: null, lastError: null, lastErrorAt: null, alertedAt: null };
    st.checks.set(key, s);
  }
  return s;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 120 ? `${m} мин` : `${Math.round(m / 60)} ч`;
};

async function alert(html: string) {
  try {
    const { notifyAdmins } = await import("@/lib/telegram");
    const { SITE } = await import("@/lib/site");
    await notifyAdmins(html, { text: "Состояние сайта", url: `${SITE.url}/admin/health` });
  } catch (e) {
    console.error("[watchdog] не удалось сообщить:", e instanceof Error ? e.message : e);
  }
}

/** Результат проверки или фоновой задачи */
export function report(key: string, ok: boolean, err?: unknown) {
  const s = state(key);
  const now = Date.now();
  if (ok) {
    if (s.alertedAt && s.failingSince) void alert(`✅ <b>${esc(s.title)}</b> снова работает (не работало ${minutes(now - s.failingSince)}).`);
    s.ok = true;
    s.fails = 0;
    s.failingSince = null;
    s.alertedAt = null;
    s.lastOkAt = now;
    return;
  }
  s.ok = false;
  s.fails++;
  s.failingSince ??= now;
  s.lastError = cleanError(err);
  s.lastErrorAt = now;
  if (s.fails >= thresholdOf(key) && (!s.alertedAt || now - s.alertedAt > REMIND_MS)) {
    const again = s.alertedAt ? " — всё ещё" : "";
    s.alertedAt = now;
    void alert(`⚠️ <b>${esc(s.title)}</b>${again} не работает (${minutes(now - s.failingSince)}).\n${esc(s.lastError)}`);
  }
  console.error(`[watchdog] ${key}:`, s.lastError);
}

/** Ошибка при открытии страницы или нажатии кнопки (из instrumentation.onRequestError) */
export function noteRequestError(path: string, err: unknown) {
  const p = path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").slice(0, 120);
  st.errors.push({ at: Date.now(), path: p, msg: cleanError(err) });
  if (st.errors.length > 200) st.errors.splice(0, st.errors.length - 200);
}

function checkErrors() {
  const since = Date.now() - ERRORS_WINDOW_MS;
  const recent = st.errors.filter((e) => e.at >= since);
  if (recent.length < ERRORS_ALERT) return report("errors", true);
  const byPath = new Map<string, number>();
  for (const e of recent) byPath.set(e.path, (byPath.get(e.path) ?? 0) + 1);
  const top = [...byPath.entries()].sort((a, b) => b[1] - a[1])[0];
  const last = recent.findLast((e) => e.path === top[0]);
  report("errors", false, `${recent.length} ошибок за 10 минут, чаще всего на ${top[0]} (${top[1]}): ${last?.msg ?? ""}`);
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`нет ответа за ${ms / 1000} с`)), ms))]);

async function probe(key: string, fn: () => Promise<unknown>) {
  try {
    await withTimeout(fn(), 20_000);
    report(key, true);
  } catch (e) {
    report(key, false, e);
  }
}

/** Проверки связи — раз в 5 минут из instrumentation */
export async function watchdogTick() {
  const n = st.tick++;
  const jobs: Promise<void>[] = [];
  jobs.push(
    probe("db", async () => {
      const { db } = await import("@/db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`select 1`);
    }),
  );
  const yk = await import("@/lib/yookassa");
  if (yk.yookassaEnabled()) jobs.push(probe("yookassa", yk.pingYookassa));
  const cdek = await import("@/lib/cdek");
  if (cdek.cdekEnabled()) jobs.push(probe("cdek", cdek.pingCdek));
  const tg = await import("@/lib/telegram");
  if (tg.telegramEnabled() && n % 2 === 0) jobs.push(probe("telegram", tg.pingTelegram));
  const mail = await import("@/lib/mail");
  if (mail.mailEnabled() && Date.now() - st.mailAt > 30 * 60_000) {
    st.mailAt = Date.now();
    jobs.push(probe("mail", mail.verifyMail));
  }
  await Promise.all(jobs);
  checkErrors();
}

/** Сколько сейчас сломано (о чём уже сообщили) — красная цифра в меню админки */
export const watchdogProblems = () => [...st.checks.values()].filter((s) => s.ok === false && s.alertedAt).length;

/** Для страницы «Состояние сайта» */
export function watchdogStatus() {
  const since = Date.now() - ERRORS_WINDOW_MS * 6;
  return {
    checks: [...st.checks.values()].sort((a, b) => Number(a.ok !== false) - Number(b.ok !== false) || a.title.localeCompare(b.title, "ru")),
    errors: st.errors.filter((e) => e.at >= since).slice(-30).reverse(),
  };
}
