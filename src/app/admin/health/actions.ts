"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/viewer";

/** Проверить всё прямо сейчас */
export async function checkNowAction() {
  await requireAdmin("OWNER");
  const { watchdogTick } = await import("@/lib/watchdog");
  await watchdogTick();
  revalidatePath("/admin/health");
}

/** Проверочное сообщение: убедиться, что сигнал о сбое дойдёт до Telegram и телефона */
export async function testAlertAction(): Promise<{ ok?: string; error?: string }> {
  await requireAdmin("OWNER");
  const { notifyAdmins, telegramEnabled } = await import("@/lib/telegram");
  await notifyAdmins("🧪 Проверка сторожа сайта: так придёт сообщение, если что-то сломается.");
  return telegramEnabled()
    ? { ok: "Отправили в Telegram и уведомлением на телефон — проверьте, дошло ли." }
    : { ok: "Telegram-бот не подключён — отправили только уведомлением на телефон (если включены)." };
}
