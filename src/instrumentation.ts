/**
 * Фоновые задачи сайта. Запускаются один раз при старте сервера:
 *   • каждую минуту — спрашиваем ЮKassa об оплате ожидающих заказов;
 *   • каждые 5 минут — отменяем неоплаченные вовремя заказы (товар возвращается в продажу);
 *   • каждые 30 минут — подтягиваем трек-номера и статусы из СДЭК;
 *   • каждую минуту — очередная партия писем рассылки;
 *   • каждый час — сгорание бонусов, подарки ко дню рождения, напоминания о сгорании.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_JOBS === "true") return;
  const g = globalThis as unknown as { __asJobs?: boolean };
  if (g.__asJobs) return;
  g.__asJobs = true;

  const { expireUnpaidOrders, pollPendingPayments, syncShipments } = await import("@/lib/orders");
  const safe = (name: string, fn: () => Promise<void>) => () =>
    fn().catch((e) => console.error(`[jobs] ${name}:`, e instanceof Error ? e.message : e));

  // Telegram-бот: получаем сообщения длинным опросом (через 20 секунд — когда сайт уже отвечает)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setTimeout(() => import("@/lib/telegram").then((t) => t.startPolling()).catch((e) => console.error("[telegram] polling:", e?.message ?? e)), 20_000);
  }

  // Первый запуск — через минуту: пусть база успеет обновиться после выкладки
  setTimeout(safe("expire", expireUnpaidOrders), 60_000);
  setInterval(safe("expire", expireUnpaidOrders), 5 * 60_000);
  setInterval(safe("payments", pollPendingPayments), 60_000);
  setInterval(safe("cdek", syncShipments), 30 * 60_000);

  // Рассылки: очередь писем — партия раз в минуту (и сразу после перезапуска, если рассылка шла)
  const { processCampaigns } = await import("@/lib/campaigns");
  setTimeout(safe("mailing", processCampaigns), 90_000);
  setInterval(safe("mailing", processCampaigns), 60_000);

  // Бонусы: сгорание, день рождения, напоминания — раз в час (всё повторно безопасно)
  const bonuses = await import("@/lib/bonuses");
  const hourly = async () => {
    await bonuses.expireBonuses();
    await bonuses.birthdayBonuses();
    await bonuses.remindExpiring();
  };
  setTimeout(safe("bonuses", hourly), 3 * 60_000);
  setInterval(safe("bonuses", hourly), 60 * 60_000);
}
