/**
 * Фоновые задачи сайта. Запускаются один раз при старте сервера:
 *   • каждые 5 минут — отменяем неоплаченные вовремя заказы (товар возвращается в продажу);
 *   • каждые 30 минут — подтягиваем трек-номера и статусы из СДЭК.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_JOBS === "true") return;
  const g = globalThis as unknown as { __asJobs?: boolean };
  if (g.__asJobs) return;
  g.__asJobs = true;

  const { expireUnpaidOrders, syncShipments } = await import("@/lib/orders");
  const safe = (name: string, fn: () => Promise<void>) => () =>
    fn().catch((e) => console.error(`[jobs] ${name}:`, e instanceof Error ? e.message : e));

  // Первый запуск — через минуту: пусть база успеет обновиться после выкладки
  setTimeout(safe("expire", expireUnpaidOrders), 60_000);
  setInterval(safe("expire", expireUnpaidOrders), 5 * 60_000);
  setInterval(safe("cdek", syncShipments), 30 * 60_000);
}
