"use server";
import { z } from "zod";
import { getActiveConsent } from "@/lib/consent";
import { fmtDate, rub } from "@/lib/format";
import { buyGiftCard, checkGiftCode, GiftError } from "@/lib/giftcards";
import { createRateLimiter } from "@/lib/rate-limit";
import { getOrigin, getRequestMeta } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { getActiveBan, getViewer } from "@/lib/viewer";

const BuyIn = z.object({
  amount: z.number().int().positive(), // рубли
  email: z.email("Проверьте почту — на неё придёт чек и сертификат").max(200),
  recipientName: z.string().trim().max(60).nullish(),
  recipientEmail: z.union([z.literal(""), z.email("Проверьте почту получателя").max(200)]).nullish(),
  senderName: z.string().trim().max(60).nullish(),
  message: z.string().trim().max(300, "Пожелание — до 300 символов").nullish(),
  sendDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

const buyLimit = createRateLimiter({ limit: 6, windowMs: 10 * 60_000 });
const checkLimit = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

export async function buyGiftAction(raw: unknown): Promise<{ payUrl?: string; error?: string }> {
  const user = await getViewer();
  if (!user) return { error: "Войдите в аккаунт, чтобы купить сертификат" };
  if (getActiveBan(user)) return { error: "Аккаунт заблокирован" };
  const settings = await getSettings();
  if (settings.pdPause) return { error: settings.pdPauseMessage };
  if (!(await getActiveConsent(user.id, "PERSONAL_DATA"))) return { error: "Нужно согласие на обработку персональных данных — откройте личный кабинет" };
  if (!buyLimit(user.id)) return { error: "Слишком много попыток. Подождите несколько минут" };

  const p = BuyIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля формы" };
  const d = p.data;
  if (isPlaceholderEmail(d.email)) return { error: "Укажите настоящую почту — на неё придёт чек" };

  // Дата отправки — в 10:00 по Москве; сегодня или раньше — сразу после оплаты
  let sendAt: Date | null = null;
  if (d.recipientEmail && d.sendDate) {
    const at = new Date(`${d.sendDate}T10:00:00+03:00`);
    if (Number.isNaN(+at)) return { error: "Проверьте дату отправки" };
    if (at.getTime() > Date.now() + 366 * 86400_000) return { error: "Отправить можно не позже чем через год" };
    if (at.getTime() > Date.now()) sendAt = at;
  }

  try {
    const origin = await getOrigin(SITE.url);
    const r = await buyGiftCard(
      user,
      {
        amount: d.amount * 100,
        email: d.email,
        recipientName: d.recipientName,
        recipientEmail: d.recipientEmail || null,
        senderName: d.senderName,
        message: d.message,
        sendAt,
      },
      origin,
    );
    return { payUrl: r.payUrl };
  } catch (e) {
    if (e instanceof GiftError) return { error: e.message };
    console.error("[gift] buy:", e);
    return { error: "Не получилось. Попробуйте ещё раз через минуту" };
  }
}

export async function checkBalanceAction(code: string): Promise<{ ok?: string; error?: string }> {
  const ip = (await getRequestMeta()).ip ?? "?";
  if (!checkLimit(ip)) return { error: "Слишком много проверок. Подождите 10 минут" };
  const r = await checkGiftCode(String(code ?? "").slice(0, 40));
  if ("error" in r) return { error: r.error };
  return { ok: `На сертификате ${rub(r.card.balance)}${r.card.expiresAt ? `, действует до ${fmtDate(r.card.expiresAt)}` : ""}` };
}
