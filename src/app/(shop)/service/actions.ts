"use server";
import { z } from "zod";
import { getActiveConsent } from "@/lib/consent";
import { normalizePhone } from "@/lib/format";
import { createRateLimiter } from "@/lib/rate-limit";
import { createServiceRequest, ServiceError } from "@/lib/service";
import { isPlaceholderEmail } from "@/lib/site";
import { getSettings } from "@/lib/settings";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

const limit = createRateLimiter({ limit: 5, windowMs: 3600_000 });

const In = z.object({
  itemIds: z.array(z.string().max(64)).min(1, "Выберите, что нужно сделать").max(20),
  description: z.string().trim().max(2000, "Описание — до 2000 символов"),
  photos: z.array(z.string().regex(/^\/media\/[\w-]+$/)).max(6, "До 6 фото"),
  name: z.string().trim().min(2, "Укажите имя").max(120),
  phone: z.string().trim().max(40),
  email: z.email("Проверьте почту").max(200),
  handover: z.enum(["CLUB", "CDEK"]),
  clubId: z.string().max(64).nullish(),
  returnMethod: z.enum(["CLUB", "CDEK"]),
  returnAddress: z.string().trim().max(300).nullish(),
});

export async function createServiceAction(raw: unknown): Promise<{ number?: string; error?: string }> {
  const user = await getViewer();
  if (!user) return { error: "Войдите в аккаунт, чтобы оставить заявку" };
  if (getActiveBan(user)) return { error: "Аккаунт заблокирован" };
  const settings = await getSettings();
  if (settings.maintenance && !isAdmin(user)) return { error: settings.maintenanceMessage || "Сайт на техработах — оформить сейчас нельзя. Загляните чуть позже" };
  if (!(await getActiveConsent(user.id, "PERSONAL_DATA"))) return { error: "Нужно согласие на обработку персональных данных — откройте личный кабинет" };
  if (!limit(user.id)) return { error: "Слишком много заявок подряд — попробуйте через час" };
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля формы" };
  const phone = normalizePhone(p.data.phone);
  if (!phone) return { error: "Проверьте телефон: нужен российский номер" };
  if (isPlaceholderEmail(p.data.email)) return { error: "Укажите настоящую почту — на неё придут новости по заявке" };
  try {
    const r = await createServiceRequest(user.id, { ...p.data, phone });
    return { number: r.number };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    console.error("[service] create:", e);
    return { error: "Не удалось отправить заявку. Попробуйте ещё раз" };
  }
}
