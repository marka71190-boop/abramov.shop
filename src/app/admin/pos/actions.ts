"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { clubTitle } from "@/lib/club-label";
import { getClub } from "@/lib/clubs";
import { rub } from "@/lib/format";
import { PinError, verifyPin } from "@/lib/pin";
import { cancelSale, createSale, discountOverLimit, findCustomer, PosError, refreshSale, returnSale, saleForReturn, type PosCustomer, type SaleRow } from "@/lib/pos";
import { addCashMove, closeShift, currentShift, openShift, ShiftError } from "@/lib/pos-shifts";
import { qrSvg } from "@/lib/qr";
import { createRateLimiter } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { withStockNotices } from "@/lib/stock-moves";
import { requireCashier, type UserRow } from "@/lib/viewer";

const Approval = z.object({ approverId: z.string().min(1).max(64), pin: z.string().regex(/^\d{6}$/, "PIN — 6 цифр") }).nullish();

const In = z.object({
  items: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(1000), price: z.number().int().min(0).max(1_000_000_000) })).min(1, "Добавьте товар").max(100),
  discount: z.number().int().min(0).max(1_000_000_000),
  method: z.enum(["CASH", "SBP", "CARD"]),
  place: z.string().trim().max(120).nullable(),
  contact: z.string().trim().max(200).nullish(),
  customerPhone: z.string().trim().max(30).nullish(),
  useBonus: z.boolean().optional(),
  approval: Approval,
});

export interface SaleView {
  id: string;
  number: string;
  status: string;
  method: string;
  total: number;
  bonusSpent: number;
  bonusAccrued: number;
  qr: string | null; // SVG
  qrUrl: string | null;
}

async function view(sale: SaleRow): Promise<SaleView> {
  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    method: sale.method,
    total: sale.total,
    bonusSpent: sale.bonusSpent,
    bonusAccrued: sale.bonusAccrued,
    qr: sale.status === "PENDING" && sale.qrUrl ? await qrSvg(sale.qrUrl) : null,
    qrUrl: sale.status === "PENDING" ? sale.qrUrl : null,
  };
}

const refresh = () => {
  revalidatePath("/admin/pos");
  revalidatePath("/kassa");
};

/** Кто в кассе — для письма владельцу PIN: имя сотрудника или название телефона кассы */
async function kassaWho(me: UserRow) {
  const shift = await currentShift(me.id);
  return { kassa: me.name, staffName: shift?.staffName ?? null, place: shift?.place ?? null, shift };
}

/** Кассир видит и отменяет только свои продажи */
async function ownSale(id: string, me: { id: string }, admin: boolean) {
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, String(id).slice(0, 64)), columns: { id: true, sellerId: true, status: true } });
  if (!sale || (!admin && sale.sellerId !== me.id)) return null;
  return sale;
}

export async function posCreate(raw: unknown): Promise<{ sale?: SaleView; error?: string; needPin?: boolean }> {
  const { me, admin } = await requireCashier();
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте продажу" };
  try {
    // Продажа — только в открытой смене: так наличные сходятся с продажами
    const shift = await currentShift(me.id);
    if (!shift) return { error: "Сначала откройте смену" };
    const settings = await getSettings();
    let limits = admin ? { lockPrices: false, maxDiscountPct: null as number | null, discountById: null as string | null } : { lockPrices: true, maxDiscountPct: settings.finance.cashierMaxDiscount as number | null, discountById: null as string | null };

    // Скидка сверх лимита кассира — только с PIN менеджера
    if (!admin) {
      const catalog = await db.execute<{ id: string; price: number }>(
        sql`select v.id, coalesce(v.price, p.price)::int as price from product_variant v join product p on p.id = v.product_id where v.id in (${sql.join(
          p.data.items.map((i) => sql`${i.variantId}`),
          sql`, `,
        )})`,
      );
      const subtotal = p.data.items.reduce((a, i) => a + Number(catalog.rows.find((r) => r.id === i.variantId)?.price ?? 0) * i.qty, 0);
      const discount = Math.min(p.data.discount, subtotal);
      if (discountOverLimit(subtotal, discount, limits.maxDiscountPct)) {
        if (!p.data.approval) return { error: `Скидка больше ${limits.maxDiscountPct} % — нужен PIN менеджера`, needPin: true };
        const pct = subtotal ? Math.round((discount / subtotal) * 100) : 0;
        const who = await kassaWho(me);
        const approver = await verifyPin(p.data.approval.approverId, p.data.approval.pin, { action: `скидка ${rub(discount)} (${pct} %) на чек ${rub(subtotal)}`, ...who });
        limits = { ...limits, maxDiscountPct: null, discountById: approver.id };
      }
    }

    const sale = await withStockNotices(
      p.data.items.map((i) => i.variantId),
      () => createSale(me.id, { ...p.data, place: shift.place, shiftId: shift.id, clubId: shift.clubId }, limits),
    );
    await audit(me.id, "pos.sale", "pos_sale", sale.id, {
      number: sale.number,
      method: sale.method,
      total: sale.total,
      discount: sale.discount,
      ...(sale.discountById ? { discountBy: sale.discountById } : {}),
      ...(sale.bonusSpent ? { bonus: sale.bonusSpent } : {}),
    });
    revalidatePath("/", "layout");
    return { sale: await view(sale) };
  } catch (e) {
    if (e instanceof PosError || e instanceof PinError) return { error: e.message, needPin: e instanceof PinError };
    console.error("[pos] продажа:", e);
    return { error: "Не получилось провести продажу. Попробуйте ещё раз" };
  }
}

export async function posStatus(id: string): Promise<{ sale?: SaleView; error?: string }> {
  const { me, admin } = await requireCashier();
  if (!(await ownSale(id, me, admin))) return { error: "Продажа не найдена" };
  try {
    const sale = await refreshSale(String(id).slice(0, 64));
    if (!sale) return { error: "Продажа не найдена" };
    if (sale.status !== "PENDING") refresh();
    return { sale: await view(sale) };
  } catch (e) {
    console.error("[pos] статус:", e instanceof Error ? e.message : e);
    return { error: "Нет связи с ЮKassa — проверим ещё раз" };
  }
}

/** Отменить продажу, которую ещё не оплатили по QR. Оплаченную — только возвратом */
export async function posCancel(id: string): Promise<{ ok?: string; error?: string }> {
  const { me, admin } = await requireCashier();
  const own = await ownSale(id, me, admin);
  if (!own) return { error: "Продажа не найдена" };
  try {
    const before = await refreshSale(own.id).catch(() => null);
    if ((before?.status ?? own.status) === "PAID") return { error: "Продажа уже оплачена — оформите возврат" };
    const sale = await cancelSale(own.id, me.id);
    if (!sale) return { error: "Продажа не найдена" };
    await audit(me.id, "pos.cancel", "pos_sale", sale.id, { number: sale.number, method: sale.method, total: sale.total });
    revalidatePath("/", "layout");
    return { ok: `Продажа ${sale.number} отменена` };
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    console.error("[pos] отмена:", e);
    return { error: "Не получилось отменить — попробуйте ещё раз" };
  }
}

// ---------------------------------------------------------------- бонусы покупателя

const findLimit = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

export async function posFindCustomer(phone: string): Promise<{ customer?: PosCustomer; error?: string }> {
  const { me } = await requireCashier();
  if (!findLimit(me.id)) return { error: "Слишком много поисков — подождите несколько минут" };
  try {
    const c = await findCustomer(String(phone).slice(0, 30));
    if (!c) return { error: "Покупатель с таким телефоном не найден. Пусть зарегистрируется на сайте — бонусы начисляются на аккаунт" };
    return { customer: c };
  } catch (e) {
    return { error: e instanceof PosError ? e.message : "Не получилось найти покупателя" };
  }
}

// ---------------------------------------------------------------- возврат

export interface ReturnView {
  id: string;
  number: string;
  date: string;
  method: string;
  total: number;
  refunded: number;
  bonusSpent: number;
  place: string | null;
  customer: boolean;
  items: { id: string; name: string; price: number; left: number; quantity: number }[];
}

/** Найти продажу для возврата по номеру чека. Кассир, закреплённый за клубами, — только продажи своих клубов */
export async function posFindSale(number: string): Promise<{ sale?: ReturnView; error?: string }> {
  const { me, admin } = await requireCashier();
  const sale = await saleForReturn(String(number).slice(0, 30));
  if (!sale) return { error: "Чек не найден. Номер — как на экране продажи: K-261107-ABCD" };
  if (!admin && me.clubIds.length && !(sale.clubId && me.clubIds.includes(sale.clubId)) && sale.sellerId !== me.id) return { error: "Это продажа другого клуба — возврат оформляют там или менеджер" };
  if (sale.status !== "PAID") return { error: sale.status === "PENDING" ? "Продажа ещё не оплачена — её можно отменить в списке продаж" : "Продажа отменена — возвращать нечего" };
  const items = sale.items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, left: i.quantity - i.returnedQty }));
  if (!items.some((i) => i.left > 0)) return { error: "По этому чеку уже всё вернули" };
  return {
    sale: {
      id: sale.id,
      number: sale.number,
      date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(sale.paidAt ?? sale.createdAt),
      method: sale.method,
      total: sale.total,
      refunded: sale.refunded,
      bonusSpent: sale.bonusSpent,
      place: sale.place,
      customer: !!sale.customerId,
      items,
    },
  };
}

const ReturnIn = z.object({
  saleId: z.string().min(1).max(64),
  items: z.array(z.object({ saleItemId: z.string().min(1).max(64), qty: z.number().int().min(0).max(1000) })).min(1).max(100),
  reason: z.string().trim().max(300).nullish(),
  approval: Approval,
});

export async function posReturn(raw: unknown): Promise<{ ok?: string; error?: string; needPin?: boolean; money?: number; cash?: boolean }> {
  const { me, admin } = await requireCashier();
  const p = ReturnIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте возврат" };
  try {
    const sale = await saleForReturn((await db.query.posSale.findFirst({ where: eq(s.posSale.id, p.data.saleId), columns: { number: true } }))?.number ?? "");
    if (!sale) return { error: "Продажа не найдена" };
    if (!admin && me.clubIds.length && !(sale.clubId && me.clubIds.includes(sale.clubId)) && sale.sellerId !== me.id) return { error: "Это продажа другого клуба" };
    const shift = await currentShift(me.id);
    if (sale.method === "CASH" && !shift && !admin) return { error: "Откройте смену — наличные за возврат выдаются из кассы смены" };

    // Кассир — только с PIN менеджера; менеджер в своей кассе подтверждает сам
    let approverId: string | null = admin ? me.id : null;
    if (!admin) {
      if (!p.data.approval) return { error: "Возврат подтверждает менеджер своим PIN", needPin: true };
      const n = p.data.items.reduce((a, i) => a + i.qty, 0);
      const approver = await verifyPin(p.data.approval.approverId, p.data.approval.pin, {
        action: `возврат по чеку ${sale.number} (${n} шт., ${sale.method === "CASH" ? "наличными" : "через ЮKassa"})`,
        kassa: me.name,
        staffName: shift?.staffName ?? null,
        place: shift?.place ?? sale.place,
      });
      approverId = approver.id;
    }
    const r = await withStockNotices(
      sale.items.map((i) => i.variantId).filter((x): x is string => !!x),
      () => returnSale(sale.id, { items: p.data.items, reason: p.data.reason ?? null, sellerId: me.id, approverId, shiftId: shift?.id ?? null }),
    );
    await audit(me.id, "pos.return", "pos_sale", sale.id, { number: r.ret.number, sale: sale.number, amount: r.money, method: r.method, approver: approverId });
    revalidatePath("/", "layout");
    // Сотрудникам — коротко, без покупателя
    void import("@/lib/telegram")
      .then((t) => t.notifyAdmins(`↩️ Возврат в кассе ${r.ret.number} по чеку ${sale.number}: ${rub(r.money)}${r.method === "CASH" ? " наличными" : r.method === "YOOKASSA" ? " через ЮKassa" : ""}. ${me.name}${shift?.staffName ? ` (${shift.staffName})` : ""}`))
      .catch(() => {});
    const bonus = r.bonusBack ? ` Бонусы покупателя (${Math.floor(r.bonusBack / 100)}) вернулись на его счёт.` : "";
    return {
      ok:
        r.method === "CASH"
          ? `Возврат ${r.ret.number} оформлен. Отдайте покупателю ${rub(r.money)} наличными из кассы — сумма учтена в смене.${bonus}`
          : r.method === "YOOKASSA"
            ? `Возврат ${r.ret.number} оформлен: ${rub(r.money)} вернутся покупателю через ЮKassa (обычно 1–3 дня).${bonus}`
            : `Возврат ${r.ret.number} оформлен.${bonus}`,
      money: r.money,
      cash: r.method === "CASH",
    };
  } catch (e) {
    if (e instanceof PosError || e instanceof PinError) return { error: e.message, needPin: e instanceof PinError };
    console.error("[pos] возврат:", e);
    return { error: "Не получилось оформить возврат — возможно, ЮKassa не приняла его. Попробуйте ещё раз" };
  }
}

// ---------------------------------------------------------------- смены

const money = (v: FormDataEntryValue | null) => {
  const n = Math.round(Number(String(v ?? "").replace(",", ".").replace(/\s/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000_00 ? n : null;
};

export type ShiftState = { ok?: string; error?: string };

export async function shiftOpen(_: ShiftState, fd: FormData): Promise<ShiftState> {
  const { me, admin } = await requireCashier();
  const opening = String(fd.get("opening") ?? "").trim() ? money(fd.get("opening")) : 0;
  if (opening == null) return { error: "Размен — сумма в рублях, например 2000" };
  // Клуб: кассир, закреплённый за клубами, — только в своих; иначе можно и турнир
  const clubId = String(fd.get("clubId") ?? "").trim() || null;
  const fixed = !admin && me.clubIds.length > 0;
  let place: string | null = null;
  if (clubId) {
    if (fixed && !me.clubIds.includes(clubId)) return { error: "Это не ваш клуб — выберите из списка" };
    const club = await getClub(clubId);
    if (!club || !club.isActive) return { error: "Клуб не найден" };
    place = clubTitle(club);
  } else {
    if (fixed) return { error: "Выберите клуб" };
    place = String(fd.get("place") ?? "").trim().slice(0, 120) || null;
    if (!place) return { error: "Выберите клуб или впишите, где продаёте" };
  }
  // Общий телефон кассы: кто сегодня на смене — чтобы недостача была не «у телефона», а у человека
  const staffName = String(fd.get("staffName") ?? "")
    .replace(/[^\p{L}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (me.isDevice && staffName.length < 2) return { error: "Впишите, кто на смене — имя и фамилию" };
  try {
    const shift = await openShift(me.id, { openingCash: opening, place, clubId, staffName: me.isDevice ? staffName : null });
    await audit(me.id, "pos.shift_open", "pos_shift", shift.id, { opening, place, staff: me.isDevice ? staffName : undefined });
    refresh();
    return { ok: "Смена открыта" };
  } catch (e) {
    return { error: e instanceof ShiftError ? e.message : "Не получилось открыть смену" };
  }
}

export async function shiftClose(_: ShiftState, fd: FormData): Promise<ShiftState> {
  const { me } = await requireCashier();
  const counted = money(fd.get("counted"));
  if (counted == null || !String(fd.get("counted") ?? "").trim()) return { error: "Пересчитайте наличные и впишите сумму" };
  const shift = await currentShift(me.id);
  if (!shift) return { error: "Смена уже закрыта" };
  try {
    const r = await closeShift(shift.id, me.id, counted, String(fd.get("note") ?? "").trim().slice(0, 300) || null);
    await audit(me.id, "pos.shift_close", "pos_shift", shift.id, { expected: r.expected, counted, diff: r.diff });
    refresh();
    const fmt = (k: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(k / 100) + " ₽";
    return { ok: r.diff === 0 ? "Смена закрыта — всё сходится" : r.diff < 0 ? `Смена закрыта. Недостача ${fmt(-r.diff)}` : `Смена закрыта. Излишек ${fmt(r.diff)}` };
  } catch (e) {
    return { error: e instanceof ShiftError ? e.message : "Не получилось закрыть смену" };
  }
}

/** Выемка (забрали из кассы) или внесение (докинули размен) */
export async function cashMoveAction(_: ShiftState, fd: FormData): Promise<ShiftState> {
  const { me } = await requireCashier();
  const kind = fd.get("kind") === "in" ? "in" : "out";
  const amount = money(fd.get("amount"));
  if (!amount) return { error: "Сумма в рублях, например 5000" };
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 200) || null;
  if (kind === "out" && !reason) return { error: "Напишите, куда забрали: например «в сейф» или «инкассация»" };
  const shift = await currentShift(me.id);
  if (!shift) return { error: "Смена закрыта" };
  try {
    const row = await addCashMove(shift.id, me.id, kind === "in" ? amount : -amount, reason, null);
    await audit(me.id, kind === "in" ? "pos.cash_in" : "pos.cash_out", "pos_shift", shift.id, { amount, reason, move: row.id });
    refresh();
    return { ok: kind === "in" ? `Внесено ${rub(amount)}` : `Выемка ${rub(amount)} записана` };
  } catch (e) {
    return { error: e instanceof ShiftError ? e.message : "Не получилось записать" };
  }
}
