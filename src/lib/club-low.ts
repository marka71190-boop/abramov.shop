/**
 * «Заканчивается в клубе»: у клуба со своим учётом остатков у каждого товара может быть норма —
 * сколько держать на полке. Осталась половина нормы (или товар закончился, если нормы нет) —
 * админам приходит сообщение и push с кнопкой «Пополнить со склада»: страница с готовым перемещением.
 * Один раз — пока остаток снова не поднимется. В сообщении только товары, остатки и клуб.
 */
import "server-only";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";
import { SITE } from "@/lib/site";

/** Порог напоминания: половина нормы; без нормы — когда закончился */
export const lowAt = (minQty: number | null) => (minQty && minQty > 0 ? Math.floor(minQty / 2) : 0);
/** Сколько привезти: до нормы, без нормы — 1 шт */
export const refillQty = (qty: number, minQty: number | null) => Math.max((minQty ?? 1) - qty, 1);

const LOW = sql`${s.clubStock.qty} <= coalesce(${s.clubStock.minQty} / 2, 0)`;

export interface ClubLine {
  variantId: string;
  name: string;
  sku: string | null;
  qty: number;
  minQty: number | null;
  warehouse: number; // свободно на складе
  low: boolean;
  short: boolean; // меньше нормы — войдёт в недельное пополнение
  bin: string | null; // ячейка на складе — лист сборки идёт по полкам
  suggest: number; // сколько предложить привезти (не больше, чем есть на складе)
}

/** Товары клуба: всё, что там было или для чего задана норма, плюс то, что есть на складе */
export async function clubLines(clubId: string): Promise<ClubLine[]> {
  const rows = await db.execute<{ id: string; name: string; sku: string | null; stock: number; qty: number | null; min_qty: number | null; bin: string | null }>(sql`
    select v.id,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name,
      coalesce(v.sku, p.sku) as sku, v.stock, v.bin, cs.qty, cs.min_qty
    from product_variant v join product p on p.id = v.product_id
    left join club_stock cs on cs.variant_id = v.id and cs.club_id = ${clubId}
    where v.is_active and (cs.variant_id is not null or v.stock > 0)
    order by p.name, v.sort_order`);
  return rows.rows.map((r) => {
    const qty = Number(r.qty ?? 0);
    const minQty = r.min_qty == null ? null : Number(r.min_qty);
    const warehouse = Number(r.stock);
    const tracked = r.qty != null;
    const low = tracked && qty <= lowAt(minQty);
    const short = tracked && minQty != null && qty < minQty;
    return { variantId: r.id, name: r.name, sku: r.sku, qty, minQty, warehouse, low, short, bin: r.bin, suggest: Math.min(refillQty(qty, minQty), Math.max(warehouse, 0)) };
  });
}

/** Задать нормы клуба: variantId → штук (null или 0 — убрать норму) */
export async function setClubNorms(clubId: string, norms: Record<string, number | null>) {
  const club = await db.query.club.findFirst({ where: eq(s.club.id, clubId), columns: { ownStock: true } });
  if (!club?.ownStock) throw new Error("У клуба не включён свой учёт остатков");
  let n = 0;
  for (const [variantId, v] of Object.entries(norms).slice(0, 1000)) {
    const minQty = v && v > 0 ? Math.min(Math.trunc(v), 10_000) : null;
    await db
      .insert(s.clubStock)
      .values({ clubId, variantId, qty: 0, minQty, lowNotifiedAt: new Date() })
      .onConflictDoUpdate({ target: [s.clubStock.clubId, s.clubStock.variantId], set: { minQty, updatedAt: new Date() } });
    n++;
  }
  return n;
}

/** Проверить клубы (по умолчанию все) и предупредить о новых «заканчивается» */
export async function checkClubLow(variantIds?: string[]) {
  const scope = variantIds?.length ? inArray(s.clubStock.variantId, variantIds) : undefined;
  // Пополнили — снова будем следить
  await db
    .update(s.clubStock)
    .set({ lowNotifiedAt: null })
    .where(and(isNotNull(s.clubStock.lowNotifiedAt), sql`not (${LOW})`, scope));

  const rows = await db
    .select({ clubId: s.clubStock.clubId, variantId: s.clubStock.variantId, qty: s.clubStock.qty, minQty: s.clubStock.minQty, club: s.club, variant: s.productVariant.name, product: s.product.name, variants: sql<number>`(select count(*)::int from ${s.productVariant} v2 where v2.product_id = ${s.product.id} and v2.is_active)` })
    .from(s.clubStock)
    .innerJoin(s.club, eq(s.club.id, s.clubStock.clubId))
    .innerJoin(s.productVariant, eq(s.productVariant.id, s.clubStock.variantId))
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(and(LOW, isNull(s.clubStock.lowNotifiedAt), eq(s.club.ownStock, true), eq(s.club.isActive, true), eq(s.productVariant.isActive, true), scope));
  if (!rows.length) return 0;

  const fresh: typeof rows = [];
  for (const r of rows) {
    const m = await db
      .update(s.clubStock)
      .set({ lowNotifiedAt: new Date() })
      .where(and(eq(s.clubStock.clubId, r.clubId), eq(s.clubStock.variantId, r.variantId), isNull(s.clubStock.lowNotifiedAt)))
      .returning({ q: s.clubStock.qty });
    if (m.length) fresh.push(r);
  }
  if (!fresh.length) return 0;

  const byClub = new Map<string, typeof rows>();
  for (const r of fresh) byClub.set(r.clubId, [...(byClub.get(r.clubId) ?? []), r]);
  // notifyAdmins сам шлёт и push владельцу и менеджерам — даже без Telegram
  const { esc, notifyAdmins } = await import("@/lib/telegram");
  for (const [clubId, list] of byClub) {
    const title = clubTitle(list[0].club);
    const name = (r: (typeof list)[number]) => `${r.product}${r.variants > 1 ? `, ${r.variant}` : ""}`;
    const line = (r: (typeof list)[number]) => `• ${esc(name(r))} — ${r.qty <= 0 ? "<b>закончился</b>" : `осталось <b>${r.qty}</b>`}${r.minQty ? ` (норма ${r.minQty})` : ""}`;
    await notifyAdmins(`🏷 Заканчивается в клубе ${esc(title)}\n${list.slice(0, 30).map(line).join("\n")}${list.length > 30 ? `\n…и ещё ${list.length - 30}` : ""}`, {
      text: "Пополнить со склада",
      url: `${SITE.url}/admin/stock/refill?club=${clubId}`,
    }).catch(() => {});
  }
  return fresh.length;
}

/**
 * Недельное пополнение: по понедельникам в 10:00 (Москва) — по каждому клубу готовый список
 * «что отвезти до нормы» с кнопкой «Собрать». Проверка — раз в 10 минут, отправка — один раз в день.
 * force — прислать сейчас (кнопка на странице «Пополнить клуб»).
 */
export async function weeklyRefillDigest(force = false) {
  if (!force) {
    const now = new Date();
    const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", ...o }).format(now);
    if (part({ weekday: "short" }) !== "Mon" || Number(part({ hour: "numeric", hourCycle: "h23" })) !== 10) return 0;
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now);
    // Отметку ставим до отправки: два экземпляра сайта не пришлют список дважды
    const r = await db.execute(sql`
      insert into setting (key, value, updated_at) values ('club-refill-weekly', ${JSON.stringify({ day })}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
      where setting.value ->> 'day' is distinct from ${day}
      returning key`);
    if (!r.rows.length) return 0;
  }
  const clubs = await db.query.club.findMany({ where: and(eq(s.club.ownStock, true), eq(s.club.isActive, true)) });
  const { esc, notifyAdmins } = await import("@/lib/telegram");
  let sent = 0;
  for (const c of clubs) {
    const need = (await clubLines(c.id)).filter((l) => l.short || l.low);
    const can = need.filter((l) => l.suggest > 0);
    if (!can.length) continue;
    const units = can.reduce((a, l) => a + l.suggest, 0);
    const none = need.length - can.length;
    const line = (l: ClubLine) => `• ${esc(l.name)} — <b>${l.suggest} шт</b>${l.bin ? ` (ячейка ${esc(l.bin)})` : ""}`;
    await notifyAdmins(
      `🚚 Пополнение на неделю: ${esc(clubTitle(c))}\nДо нормы: <b>${can.length} поз., ${units} шт</b>${none ? `\nНет на складе: ${none} поз.` : ""}\n${can.slice(0, 20).map(line).join("\n")}${can.length > 20 ? `\n…и ещё ${can.length - 20}` : ""}`,
      { text: "Собрать", url: `${SITE.url}/admin/stock/refill?club=${c.id}&m=norm` },
    ).catch(() => {});
    sent++;
  }
  return sent;
}

/** Сколько позиций заканчивается во всех клубах — для счётчика в меню */
export async function clubLowCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.clubStock)
    .innerJoin(s.club, eq(s.club.id, s.clubStock.clubId))
    .innerJoin(s.productVariant, eq(s.productVariant.id, s.clubStock.variantId))
    .where(and(LOW, eq(s.club.ownStock, true), eq(s.club.isActive, true), eq(s.productVariant.isActive, true), isNotNull(s.clubStock.minQty)));
  return r?.n ?? 0;
}
