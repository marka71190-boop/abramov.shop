"use server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { getActiveConsent } from "@/lib/consent";
import { normalizePhone, rub } from "@/lib/format";
import { createRateLimiter } from "@/lib/rate-limit";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { getTurnkey, turnkeyNumber } from "@/lib/turnkey";
import { estimate } from "@/lib/turnkey-config";
import { checkLayout, polygonArea, sanePlan, type Placed } from "@/lib/turnkey-geom";
import { getSettings } from "@/lib/settings";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

const limit = createRateLimiter({ limit: 5, windowMs: 3600_000 });

const In = z.object({
  name: z.string().trim().min(2, "Как к вам обращаться").max(120),
  phone: z.string().trim().max(40),
  email: z.email("Проверьте почту").max(200),
  city: z.string().trim().max(80).default(""),
  comment: z.string().trim().max(2000).optional(),
  budget: z.number().int().min(0).max(100_000_000_000).nullish(),
  tableGap: z.number().int().min(0).max(4000).optional(),
  plan: z.unknown(),
  tables: z.array(z.object({ modelId: z.string().max(20), x: z.number().finite(), y: z.number().finite(), rot: z.union([z.literal(0), z.literal(90)]) })).max(200),
});

export async function createTurnkeyAction(raw: unknown): Promise<{ number?: string; error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Войдите в аккаунт, чтобы получить КП" };
  if (getActiveBan(me)) return { error: "Аккаунт заблокирован" };
  const settings = await getSettings();
  if (settings.maintenance && !isAdmin(me)) return { error: settings.maintenanceMessage || "Сайт на техработах — оформить сейчас нельзя. Загляните чуть позже" };
  if (!(await getActiveConsent(me.id, "PERSONAL_DATA"))) return { error: "Нужно согласие на обработку персональных данных — откройте личный кабинет" };
  if (!limit(me.id)) return { error: "Слишком много заявок подряд — попробуйте через час" };
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const d = p.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { error: "Проверьте телефон: нужен российский номер" };
  if (isPlaceholderEmail(d.email)) return { error: "Укажите настоящую почту — на неё придёт КП" };
  const cfg = await getTurnkey();
  if (!cfg.enabled) return { error: "Приём заявок сейчас закрыт" };
  const plan = sanePlan(d.plan);
  if (!plan) return { error: "План зала не получился — нарисуйте контур ещё раз" };
  const tables: Placed[] = d.tables
    .filter((t) => cfg.models.some((m) => m.id === t.modelId && m.active))
    .map((t, i) => ({ id: `t${i + 1}`, modelId: t.modelId, x: Math.round(t.x), y: Math.round(t.y), rot: t.rot }));
  if (!tables.length) return { error: "Поставьте хотя бы один стол" };
  // Цены — по текущему прайсу, не из браузера
  const est = estimate(tables, cfg);
  const area = Math.round(polygonArea(plan.points) / 10_000); // мм² → м² × 100
  // Расстояние между столами: выбор клиента, но не меньше минимума магазина
  const tableGap = Math.max(cfg.gaps.table, d.tableGap ?? cfg.gaps.table);
  const problems = checkLayout(plan, tables, cfg.models, { wall: cfg.gaps.wall, table: tableGap }).filter(Boolean).length;
  const budget = d.budget && d.budget > 0 ? d.budget : null;

  const number = turnkeyNumber();
  const [row] = await db
    .insert(s.turnkeyRequest)
    .values({
      number,
      userId: me.id,
      name: d.name,
      phone,
      email: d.email,
      city: d.city,
      comment: [d.comment, problems ? `⚠️ Столов с нарушением отступов: ${problems}` : ""].filter(Boolean).join("\n") || null,
      plan,
      tables,
      models: cfg.models.filter((m) => tables.some((t) => t.modelId === m.id)),
      estimate: est.lines,
      area,
      tableCount: tables.length,
      tableGap,
      budget,
      total: est.total,
    })
    .returning();
  await auditSystem(me.id, "turnkey.create", "turnkey", row.id, { number, tables: tables.length });

  // Админам — без персональных данных
  const { notifyAdmins } = await import("@/lib/telegram");
  void notifyAdmins(
    `🏗 <b>Клуб под ключ: заявка ${number}</b>\nСтолов: ${tables.length}, зал ${(area / 100).toLocaleString("ru-RU")} м², между столами ${(tableGap / 1000).toLocaleString("ru-RU")} м${budget ? `\nБюджет клиента: ${budget.toLocaleString("ru-RU")} ₽` : ""}\nСмета: ${est.total ? `${rub(est.total)}${est.partial ? " + позиции по запросу" : ""}` : "цены по запросу"}`,
    { text: "Открыть заявку", url: `${SITE.url}/admin/turnkey/${row.id}` },
  ).catch(() => {});
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  if (mailEnabled()) {
    void sendMail(
      d.email,
      `Коммерческое предложение ${number} — бильярдный клуб под ключ`,
      "Ваш клуб под ключ",
      `Сохранили ваш проект: ${tables.length} ${tables.length === 1 ? "стол" : tables.length < 5 ? "стола" : "столов"}, зал ${(area / 100).toLocaleString("ru-RU")} м². ${est.total ? `Предварительная смета — <b>${rub(est.total)}</b>${est.partial ? " (часть позиций — по запросу)" : ""}.` : "Стоимость рассчитает менеджер."}<br><br>Менеджер свяжется с вами, уточнит детали и договорится о замере. Коммерческое предложение с планом можно открыть и сохранить в PDF по кнопке ниже.`,
      { text: "Открыть КП", url: `${SITE.url}/klub-pod-klyuch/${number}` },
    ).catch((e) => console.error("[turnkey] письмо:", e));
  }
  return { number };
}
