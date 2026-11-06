/**
 * Отчёты в Telegram для владельца и менеджеров: /today, /week, /month, /stock, /sales.
 * Только цифры и названия товаров — никаких персональных данных покупателей.
 * Прибыль и себестоимость видит только владелец, менеджер — выручку и продажи.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { financeReport, mskDate, periodRange } from "@/lib/finance";
import { num, rub } from "@/lib/format";
import { lowStockThreshold, stockReport } from "@/lib/low-stock";
import { POS_METHODS, type PosMethod } from "@/lib/pos";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const minus = (k: number) => (k > 0 ? `−${rub(k)}` : rub(0));
const money = (k: number) => (k < 0 ? `−${rub(-k)}` : rub(k));

export const ADMIN_COMMANDS = [
  { command: "today", description: "Выручка и прибыль за сегодня" },
  { command: "week", description: "За 7 дней" },
  { command: "month", description: "За этот месяц" },
  { command: "sales", description: "Продажи в кассе сегодня" },
  { command: "stock", description: "Что заканчивается и сколько товара" },
  { command: "orders", description: "Мои заказы" },
  { command: "help", description: "Помощь" },
];

const longDate = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(d);

export async function periodText(key: "today" | "yesterday" | "week" | "month", owner: boolean) {
  const p = periodRange(key);
  const r = await financeReport(p.from, p.to);
  const title = key === "today" || key === "yesterday" ? `${p.label}, ${longDate(p.from)}` : `${p.label} (${longDate(p.from)} — ${longDate(new Date(+p.to - 1))})`;
  const lines = [`📊 <b>${esc(title)}</b>`, "", `Выручка: <b>${rub(r.revenue)}</b>`];
  const parts: string[] = [];
  if (r.site.orders) parts.push(`  • сайт: ${rub(r.site.revenue)} (${num(r.site.orders)} заказ.)`);
  if (r.pos.sales) {
    const pay = [r.pos.cash ? `нал ${rub(r.pos.cash)}` : "", r.pos.sbp ? `СБП ${rub(r.pos.sbp)}` : "", r.pos.card ? `карта ${rub(r.pos.card)}` : ""].filter(Boolean).join(" · ");
    parts.push(`  • касса: ${rub(r.pos.revenue)} (${num(r.pos.sales)} чек.${pay ? `; ${pay}` : ""})`);
  }
  if (r.service.revenue) parts.push(`  • мастерская: ${rub(r.service.revenue)}`);
  lines.push(...(parts.length ? parts : ["  продаж не было"]));
  if (owner) {
    lines.push(
      "",
      `Себестоимость: ${minus(r.cogs)}`,
      `Валовая прибыль: <b>${money(r.gross)}</b>`,
      `Комиссии: ${minus(r.fees)}`,
      `Доставка СДЭК: ${minus(r.site.delivery)}`,
    );
    if (r.losses) lines.push(`Списания: ${minus(r.losses)}`);
    if (r.expenses.total) lines.push(`Расходы: ${minus(r.expenses.total)}`);
    if (r.tax) lines.push(`Налог ${String(r.taxPercent).replace(".", ",")} %: ${minus(r.tax)}`);
    lines.push(`${r.net < 0 ? "🔻" : "✅"} Чистая прибыль: <b>${money(r.net)}</b>`);
    if (r.missingCost) lines.push("", `⚠️ ${num(r.missingCost)} поз. без закупочной цены — прибыль завышена`);
  }
  return lines.join("\n");
}

export async function stockText(owner: boolean) {
  const [rows, limit] = await Promise.all([stockReport(), lowStockThreshold()]);
  const sellable = rows.filter((r) => r.visibility !== "DRAFT");
  const out = sellable.filter((r) => r.stock <= 0);
  const low = sellable.filter((r) => r.stock > 0 && r.stock <= Math.max(limit, 0));
  const nameOf = (r: (typeof rows)[number]) => esc(r.multi ? `${r.product}, ${r.variant}` : r.product);
  const lines = [`📦 <b>Склад</b>`];
  if (owner) {
    const value = rows.reduce((a, r) => a + (r.stock > 0 && r.costPrice != null ? r.stock * r.costPrice : 0), 0);
    const noCost = rows.filter((r) => r.stock > 0 && r.costPrice == null).length;
    lines.push(`Товара по закупке: <b>${rub(value)}</b>${noCost ? ` (без закупки: ${noCost} поз.)` : ""}`);
  }
  lines.push(`В продаже: ${num(sellable.filter((r) => r.stock > 0).length)} поз.`);
  if (low.length) lines.push("", `<b>Заканчивается</b>`, ...low.slice(0, 20).map((r) => `• ${nameOf(r)} — ${r.stock} шт`), ...(low.length > 20 ? [`…и ещё ${low.length - 20}`] : []));
  if (out.length) lines.push("", `<b>Закончилось</b>`, ...out.slice(0, 20).map((r) => `• ${nameOf(r)}`), ...(out.length > 20 ? [`…и ещё ${out.length - 20}`] : []));
  if (!low.length && !out.length) lines.push("", "Всё в наличии 👍");
  return lines.join("\n");
}

export async function salesText() {
  const p = periodRange("today");
  const sales = await db.query.posSale.findMany({
    where: and(gte(s.posSale.createdAt, p.from), inArray(s.posSale.status, ["PAID", "PENDING"])),
    orderBy: desc(s.posSale.createdAt),
    with: { items: true },
    limit: 30,
  });
  if (!sales.length) return "🧾 Сегодня в кассе продаж не было.";
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const total = sales.filter((x) => x.status === "PAID").reduce((a, x) => a + x.total, 0);
  return [
    `🧾 <b>Касса сегодня: ${rub(total)}</b>`,
    "",
    ...sales.map(
      (x) =>
        `${time.format(x.createdAt)} · <b>${rub(x.total)}</b> · ${POS_METHODS[x.method as PosMethod] ?? x.method}${x.status === "PENDING" ? " · ждём оплату" : ""}\n  ${esc(x.items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", "))}`,
    ),
  ].join("\n");
}

/** Команда админа в боте. null — это не команда отчёта */
export async function adminCommand(role: string, text: string): Promise<{ html: string; button?: { text: string; url: string } } | null> {
  const owner = role === "OWNER";
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  const site = SITE.url;
  if (cmd === "/today") return { html: await periodText("today", owner), button: owner ? { text: "Финансы на сайте", url: `${site}/admin/finance?p=today` } : undefined };
  if (cmd === "/yesterday") return { html: await periodText("yesterday", owner) };
  if (cmd === "/week") return { html: await periodText("week", owner), button: owner ? { text: "Подробнее", url: `${site}/admin/finance?p=week` } : undefined };
  if (cmd === "/month") return { html: await periodText("month", owner), button: owner ? { text: "Подробнее", url: `${site}/admin/finance?p=month` } : undefined };
  if (cmd === "/stock") return { html: await stockText(owner), button: { text: "Остатки", url: `${site}/admin/stock` } };
  if (cmd === "/sales") return { html: await salesText(), button: { text: "Открыть кассу", url: `${site}/admin/pos` } };
  return null;
}

export const ADMIN_HELP =
  "\n\n<b>Для админа</b>\n/today — выручка и прибыль за сегодня\n/yesterday — за вчера\n/week — за 7 дней\n/month — за месяц\n/sales — продажи в кассе сегодня\n/stock — склад: что заканчивается";

/**
 * Вечерняя сводка владельцу — раз в день в выбранный час.
 * Проверяется каждые 10 минут; отметка «уже отправили сегодня» — в таблице setting.
 */
export async function dailyFinanceReport() {
  const { send, telegramEnabled } = await import("@/lib/telegram");
  if (!telegramEnabled()) return;
  const f = (await getSettings()).finance;
  if (!f.dailyReport) return;
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(new Date()));
  if (hour !== f.reportHour) return;
  const today = mskDate();
  const KEY = "finance-daily-report";
  // Отметку ставим до отправки: два экземпляра сайта не пришлют сводку дважды
  const r = await db.execute(sql`
    insert into setting (key, value, updated_at) values (${KEY}, ${JSON.stringify({ day: today })}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where setting.value ->> 'day' is distinct from ${today}
    returning key`);
  if (!r.rows.length) return;
  const owners = await db
    .select({ chatId: s.user.telegramChatId })
    .from(s.user)
    .where(and(eq(s.user.role, "OWNER"), isNotNull(s.user.telegramChatId), sql`(${s.user.bannedAt} is null or (${s.user.bannedUntil} is not null and ${s.user.bannedUntil} <= now()))`));
  if (!owners.length) return;
  const html = `${await periodText("today", true)}\n\n/week — за неделю · /month — за месяц · /stock — склад`;
  for (const o of owners) if (o.chatId) await send(o.chatId, html, [{ text: "Финансы на сайте", url: `${SITE.url}/admin/finance?p=today` }]).catch(() => {});
}
