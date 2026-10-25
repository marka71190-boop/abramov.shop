import "server-only";

/** Значения-заглушки из .env.example и Dockerfile — настоящим секретом они не считаются. */
const PLACEHOLDERS = new Set(["замените-на-случайную-строку", "build-time-placeholder-not-used-at-runtime"]);

/**
 * Главный секрет сайта (BETTER_AUTH_SECRET): им подписаны ссылки «Отписаться», зашифрован доступ
 * к Google Диску и проверяется вебхук Telegram. Без настоящего секрета в работе эти функции
 * не запускаются — иначе подделать их мог бы кто угодно. Запасное значение — только при разработке.
 */
export function serverSecret(devFallback: string) {
  const v = process.env.BETTER_AUTH_SECRET?.trim();
  if (v && !PLACEHOLDERS.has(v)) return v;
  if (process.env.NODE_ENV !== "production") return devFallback;
  throw new Error("Не задан BETTER_AUTH_SECRET — добавьте его в переменные Timeweb");
}
