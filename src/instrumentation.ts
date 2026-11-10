/**
 * Фоновые задачи сайта. Запускаются один раз при старте сервера:
 *   • каждую минуту — спрашиваем ЮKassa об оплате ожидающих заказов и продаж в кассе по QR;
 *   • каждые 5 минут — отменяем неоплаченные вовремя заказы (товар возвращается в продажу);
 *   • каждые 30 минут — подтягиваем трек-номера и статусы из СДЭК;
 *   • каждую минуту — очередная партия писем рассылки;
 *   • каждые 30 минут — напоминания о брошенных корзинах;
 *   • каждые 2 минуты — подарочные сертификаты: оплата, письма получателям в выбранный день;
 *   • каждые 5 минут — оплата заявок в мастерскую (в том числе по старым ссылкам);
 *   • каждые 5 минут — сторож сайта: база, ЮKassa, СДЭК, почта, бот и ошибки на страницах (src/lib/watchdog.ts);
 *   • каждый час — сгорание бонусов, подарки ко дню рождения, напоминания о сгорании,
 *     напоминание админам о заявках на возврат, срок ответа по которым истекает,
 *     проверка «заканчивается товар», письма «оцените покупку».
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_JOBS === "true") return;
  const g = globalThis as unknown as { __asJobs?: boolean };
  if (g.__asJobs) return;
  g.__asJobs = true;

  const { expireUnpaidOrders, pollPendingPayments, syncShipments } = await import("@/lib/orders");
  // Сторож: каждая задача отчитывается — несколько сбоев подряд, и владелец узнаёт в Telegram
  const { report, watchdogTick } = await import("@/lib/watchdog");
  const safe = (name: string, fn: () => Promise<void>) => () =>
    fn().then(
      () => report(`job:${name}`, true),
      (e) => {
        console.error(`[jobs] ${name}:`, e instanceof Error ? e.message : e);
        report(`job:${name}`, false, e);
      },
    );

  // Сторож сайта: база, ЮKassa, СДЭК, почта, бот, ошибки на страницах — раз в 5 минут
  setTimeout(() => void watchdogTick().catch(() => {}), 2 * 60_000);
  setInterval(() => void watchdogTick().catch(() => {}), 5 * 60_000);

  // Telegram-бот: получаем сообщения длинным опросом (через 20 секунд — когда сайт уже отвечает)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setTimeout(() => import("@/lib/telegram").then((t) => t.startPolling()).catch((e) => console.error("[telegram] polling:", e?.message ?? e)), 20_000);
  }

  // Первый запуск — через минуту: пусть база успеет обновиться после выкладки
  setTimeout(safe("expire", expireUnpaidOrders), 60_000);
  setInterval(safe("expire", expireUnpaidOrders), 5 * 60_000);
  setInterval(safe("payments", pollPendingPayments), 60_000);
  setInterval(safe("cdek", syncShipments), 30 * 60_000);

  // Вечерняя сводка владельцу в Telegram (проверка раз в 10 минут, отправка — в выбранный час)
  const { dailyFinanceReport } = await import("@/lib/finance-bot");
  setInterval(safe("report", dailyFinanceReport), 10 * 60_000);

  // Касса: оплаты по QR (СБП/карта) и отмена неоплаченных через 20 минут
  const { pollPosSales } = await import("@/lib/pos");
  setInterval(safe("pos", pollPosSales), 60_000);
  // Касса: напоминание о незакрытой смене (ночью или через 14 часов)
  const { remindOpenShifts } = await import("@/lib/pos-shifts");
  setInterval(safe("pos-shifts", remindOpenShifts), 10 * 60_000);

  // Рассылки: очередь писем — партия раз в минуту (и сразу после перезапуска, если рассылка шла)
  const { processCampaigns } = await import("@/lib/campaigns");
  setTimeout(safe("mailing", processCampaigns), 90_000);
  setInterval(safe("mailing", processCampaigns), 60_000);

  // Оплаты мастерской (уведомления ЮKassa уходят на общий адрес с Kamui)
  const { pollServicePayments } = await import("@/lib/service");
  setInterval(safe("service", pollServicePayments), 5 * 60_000);

  // Подарочные сертификаты
  const { giftJobs } = await import("@/lib/giftcards");
  setTimeout(safe("gift", giftJobs), 75_000);
  setInterval(safe("gift", giftJobs), 2 * 60_000);

  // Напоминания о брошенных корзинах — раз в 30 минут (днём по Москве)
  const { remindAbandonedCarts } = await import("@/lib/abandoned");
  const abandoned = async () => {
    await remindAbandonedCarts();
    const { abandonedCartPromos } = await import("@/lib/abandoned");
    await abandonedCartPromos();
    const { priceDropAlerts } = await import("@/lib/price-drop");
    await priceDropAlerts();
  };
  setTimeout(safe("abandoned", abandoned), 5 * 60_000);
  setInterval(safe("abandoned", abandoned), 30 * 60_000);

  // Тренировки: напоминание за сутки
  const { remindTrainings } = await import("@/lib/trainings");
  setTimeout(safe("trainings", remindTrainings), 4 * 60_000);
  setInterval(safe("trainings", remindTrainings), 30 * 60_000);

  // Бонусы: сгорание, день рождения, напоминания — раз в час (всё повторно безопасно)
  const bonuses = await import("@/lib/bonuses");
  const hourly = async () => {
    await bonuses.expireBonuses();
    await bonuses.birthdayBonuses();
    await bonuses.remindExpiring();
    const { remindReturnDeadlines } = await import("@/lib/returns");
    await remindReturnDeadlines();
    const { checkLowStock } = await import("@/lib/low-stock");
    await checkLowStock();
    const { checkClubLow } = await import("@/lib/club-low");
    await checkClubLow();
    const { requestReviews } = await import("@/lib/review-request");
    await requestReviews();
  };
  setTimeout(safe("bonuses", hourly), 3 * 60_000);
  setInterval(safe("bonuses", hourly), 60 * 60_000);
}

/** Ошибка на странице или в кнопке сайта — сторож считает, много за 10 минут — сообщит */
export async function onRequestError(err: unknown, request: { path: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = (err as { digest?: string })?.digest ?? "";
  if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(digest)) return;
  try {
    const { noteRequestError } = await import("@/lib/watchdog");
    noteRequestError(request.path ?? "", err);
  } catch {}
}
