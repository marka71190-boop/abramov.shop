/**
 * Фиксирует отметку галочки ДО создания аккаунта.
 *
 * Форма регистрации (и кнопка «Продолжить с Google») сначала вызывает этот адрес:
 *   - согласие на обработку ПДн записывается в журнал с IP, браузером и редакцией документа;
 *   - браузеру ставится cookie с токеном;
 *   - при создании аккаунта сервер входа проверяет токен (без него аккаунт не создаётся)
 *     и привязывает записи журнала к новому пользователю.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_COOKIE, CONSENT_TTL_MIN, recordConsent } from "@/lib/consent";
import { normalizePhone } from "@/lib/format";
import { metaFromHeaders } from "@/lib/request";

const Body = z.object({
  personalData: z.literal(true, { message: "Нужно согласие на обработку персональных данных" }),
  marketing: z.boolean().default(false),
  source: z.enum(["REGISTRATION", "GOOGLE", "VK"]),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
});

// Простая защита от накрутки: не больше 20 отметок с одного IP за 10 минут
const hits = new Map<string, number[]>();
function tooMany(ip: string | null) {
  if (!ip) return false;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export async function POST(req: Request) {
  const meta = metaFromHeaders(req.headers);
  if (tooMany(meta.ip)) return NextResponse.json({ error: "Слишком много попыток, подождите немного" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" }, { status: 400 });
  }
  const b = parsed.data;
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.source === "REGISTRATION" && b.phone && !phone) {
    return NextResponse.json({ error: "Проверьте номер телефона" }, { status: 400 });
  }

  const linkToken = crypto.randomUUID();
  const common = {
    source: b.source,
    name: b.name || null,
    phone,
    email: b.source === "REGISTRATION" ? b.email || null : null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    linkToken,
  } as const;

  await recordConsent({ ...common, kind: "PERSONAL_DATA" });
  if (b.marketing) await recordConsent({ ...common, kind: "MARKETING" });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONSENT_COOKIE, linkToken, {
    httpOnly: true,
    sameSite: "lax", // cookie должна вернуться с Google на наш сайт
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_TTL_MIN * 60,
  });
  return res;
}
