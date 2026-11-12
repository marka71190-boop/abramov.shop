"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { clubTitle } from "@/lib/club-label";
import { getClub } from "@/lib/clubs";
import { rub } from "@/lib/format";
import { PinError } from "@/lib/pin";
import { ApprovalError, approvalStatus, cancelApproval, consumeApproval, requestApproval } from "@/lib/pos-approval";
import { cancelSale, createSale, discountOverLimit, findCustomer, PosError, refreshSale, returnSale, saleForReturn, type PosCustomer, type SaleRow } from "@/lib/pos";
import { addCashMove, closeShift, currentShift, openShift, ShiftError } from "@/lib/pos-shifts";
import { qrSvg } from "@/lib/qr";
import { createRateLimiter } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { withStockNotices } from "@/lib/stock-moves";
import { requireCashier } from "@/lib/viewer";

/** id подтверждённого менеджером запроса (письмо + PIN) */
const ApprovalId = z.string().max(64).nullish();

const In = z.object({
  items: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(1000), price: z.number().int().min(0).max(1_000_000_000) })).min(1, "Добавьте товар").max(100),
  discount: z.number().int().min(0).max(1_000_000_000),
  method: z.enum(["CASH", "SBP", "CARD"]),
  place: z.string().trim().max(120).nullable(),
  contact: z.string().trim().max(200).nullish(),
  customerPhone: z.string().trim().max(120).nullish(), // телефон или код бонусной карты из приложения
  useBonus: z.boolean().optional(),
  giftCode: z.string().trim().max(40).nullish(),
  approvalId: ApprovalId,
});

/** То, что подтверждает менеджер: изменили чек после подтверждения — нужно новое */
const salePayload = (d: z.infer<typeof In>) => ({
  items: d.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
  discount: d.discount,
  method: d.method,
  customerPhone: (d.customerPhone?.startsWith("ABC.") ? d.customerPhone : d.customerPhone?.replace(/\D/g, "")) || null,
  useBonus: !!d.useBonus,
});

/** Цены каталога и лимит скидки кассира */
async function catalogCheck(items: { variantId: string; qty: number }[], discountRaw: number, maxPct: number | null) {
  const rows = await db.execute<{ id: string; price: number; name: string }>(
    sql`select v.id, coalesce(v.price, p.price)::int as price,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name
      from product_variant v join product p on p.id = v.product_id where v.id in (${sql.join(
        items.map((i) => sql`${i.variantId}`),
        sql`, `,
      )})`,
  );
  const lines = items.map((i) => {
    const r = rows.rows.find((x) => x.id === i.variantId);
    return { name: r?.name ?? "Товар", qty: i.qty, amount: Number(r?.price ?? 0) * i.qty };
  });
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const discount = Math.min(discountRaw, subtotal);
  return { lines, subtotal, discount, over: discountOverLimit(subtotal, discount, maxPct) };
}

export interface SaleView {
  id: string;
  number: string;
  status: string;
  method: string;
  total: number;
  bonusSpent: number;
  bonusAccrued: number;
  giftCardAmount: number; // оплачено сертификатом
  qr: string | null; // SVG
  qrUrl: string | null;
  /** Продали сертификат: код и QR страницы сертификата — показать покупателю (когда оплачен) */
  gift?: { code: string; amount: number; expiresAt: string | null; url: string; qr: string; emailed: boolean } | null;
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
    giftCardAmount: sale.giftCardAmount,
    qr: sale.status === "PENDING" && sale.qrUrl ? await qrSvg(sale.qrUrl) : null,
    qrUrl: sale.status === "PENDING" ? sale.qrUrl : null,
    gift: sale.kind === "GIFT" && sale.status === "PAID" ? await giftView(sale.id) : null,
  };
}

async function giftView(saleId: string) {
  const c = await db.query.giftCard.findFirst({ where: eq(s.giftCard.posSaleId, saleId) });
  if (!c || c.status !== "ACTIVE") return null;
  const { giftUrl } = await import("@/lib/giftcards");
  const url = giftUrl(c.token);
  return { code: c.code, amount: c.initialAmount, expiresAt: c.expiresAt?.toISOString() ?? null, url, qr: await qrSvg(url), emailed: !!c.sentAt };
}

const refresh = () => {
  revalidatePath("/admin/pos");
  revalidatePath("/kassa");
};

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

    // Скидка сверх лимита кассира — только с подтверждением менеджера (письмо + его PIN)
    if (!admin) {
      const c = await catalogCheck(p.data.items, p.data.discount, limits.maxDiscountPct);
      if (c.over) {
        if (!p.data.approvalId) return { error: `Скидка больше ${limits.maxDiscountPct} % — нужно подтверждение менеджера`, needPin: true };
        const approverId = await consumeApproval(p.data.approvalId, me.id, "DISCOUNT", salePayload(p.data));
        limits = { ...limits, maxDiscountPct: null, discountById: approverId };
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
    if (e instanceof PosError || e instanceof PinError || e instanceof ApprovalError) return { error: e.message, needPin: e instanceof ApprovalError };
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
    const c = await findCustomer(String(phone).slice(0, 120));
    if (!c) return { error: "Покупатель не найден. Пусть зарегистрируется на сайте — бонусы начисляются на аккаунт" };
    return { customer: c };
  } catch (e) {
    return { error: e instanceof PosError ? e.message : "Не получилось найти покупателя" };
  }
}

// ---------------------------------------------------------------- паспорт кия

export interface PosPassport {
  code: string;
  serial: string;
  model: string;
  hasOwner: boolean;
}

/** Кассир отсканировал QR паспорта кия — показываем, что за кий */
export async function posPassportFind(raw: string): Promise<{ passport?: PosPassport; error?: string }> {
  const { me } = await requireCashier();
  if (!findLimit(me.id)) return { error: "Слишком много поисков — подождите несколько минут" };
  const { passportByCode, passportCodeFrom } = await import("@/lib/cue-passport");
  const code = passportCodeFrom(String(raw).slice(0, 200));
  const p = code ? await passportByCode(code) : null;
  if (!p || p.status !== "ACTIVE") return { error: "Паспорт кия не найден" };
  return { passport: { code: p.code, serial: p.serial, model: p.model, hasOwner: !!p.ownerId } };
}

/** Продажа оплачена — отмечаем в паспортах отсканированных киёв; покупатель из чека становится владельцем */
export async function posPassportSold(saleId: string, codes: string[]): Promise<{ ok?: string; error?: string }> {
  const { me } = await requireCashier();
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, String(saleId).slice(0, 64)) });
  if (!sale || sale.sellerId !== me.id || sale.status !== "PAID") return { error: "Продажа не найдена или не оплачена" };
  const { markSoldAtPos } = await import("@/lib/cue-passport");
  const done: string[] = [];
  let owned = 0;
  for (const code of codes.slice(0, 10)) {
    const r = await markSoldAtPos(String(code).slice(0, 20), sale, sale.place);
    if (r) (done.push(r.serial), r.owned && owned++);
  }
  if (!done.length) return { error: "Паспорт не найден" };
  return { ok: `Паспорт ${done.join(", ")}: продажа записана${owned ? ", кий привязан к покупателю" : sale.customerId ? "" : " — покупатель привяжет кий кодом с карточки"}` };
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
  giftCardAmount: number; // оплачено сертификатом — при возврате вернётся на сертификат
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
      giftCardAmount: sale.giftCardAmount,
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
  approvalId: ApprovalId,
});
const returnPayload = (d: z.infer<typeof ReturnIn>) => ({ saleId: d.saleId, items: d.items.filter((i) => i.qty > 0).map((i) => ({ id: i.saleItemId, qty: i.qty })) });

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

    // Кассир — только с подтверждением менеджера (письмо + его PIN); менеджер в своей кассе подтверждает сам
    let approverId: string | null = admin ? me.id : null;
    if (!admin) {
      if (!p.data.approvalId) return { error: "Возврат подтверждает менеджер", needPin: true };
      approverId = await consumeApproval(p.data.approvalId, me.id, "RETURN", returnPayload(p.data));
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
    if (e instanceof PosError || e instanceof PinError || e instanceof ApprovalError) return { error: e.message, needPin: e instanceof ApprovalError };
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

// ---------------------------------------------------------------- подтверждение менеджера

export type ApprovalRequest = { id?: string; approver?: string; expiresAt?: string; error?: string };

/** Скидка сверх лимита: отправить менеджеру письмо и ждать */
export async function posRequestSaleApproval(raw: unknown, approverId: string): Promise<ApprovalRequest> {
  const { me, admin } = await requireCashier();
  if (admin) return { error: "Менеджеру подтверждение не нужно" };
  const p = In.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте продажу" };
  const shift = await currentShift(me.id);
  if (!shift) return { error: "Сначала откройте смену" };
  const settings = await getSettings();
  const c = await catalogCheck(p.data.items, p.data.discount, settings.finance.cashierMaxDiscount);
  if (!c.over) return { error: "Скидка в пределах лимита — подтверждение не нужно" };
  const pct = c.subtotal ? Math.round((c.discount / c.subtotal) * 100) : 0;
  try {
    const r = await requestApproval({
      kind: "DISCOUNT",
      sellerId: me.id,
      approverId: String(approverId).slice(0, 64),
      payload: salePayload(p.data),
      summary: `скидка ${rub(c.discount)} (${pct} %) на чек ${rub(c.subtotal)}`,
      details: { lines: c.lines, total: c.subtotal - c.discount, discount: c.discount, percent: pct, kassa: me.name, staffName: shift.staffName, place: shift.place },
    });
    await audit(me.id, "pos.approval_request", "user", r.id, { kind: "DISCOUNT", approver: approverId, discount: c.discount });
    return { id: r.id, approver: r.approver, expiresAt: r.expiresAt.toISOString() };
  } catch (e) {
    return { error: e instanceof ApprovalError ? e.message : "Не получилось отправить запрос" };
  }
}

/** Возврат: отправить менеджеру письмо и ждать */
export async function posRequestReturnApproval(raw: unknown, approverId: string): Promise<ApprovalRequest> {
  const { me, admin } = await requireCashier();
  if (admin) return { error: "Менеджеру подтверждение не нужно" };
  const p = ReturnIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте возврат" };
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, p.data.saleId), with: { items: true } });
  if (!sale || sale.status !== "PAID") return { error: "Продажа не найдена" };
  const lines = p.data.items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const it = sale.items.find((x) => x.id === i.saleItemId);
      return { name: it?.name ?? "Товар", qty: i.qty, amount: (it?.price ?? 0) * i.qty };
    });
  if (!lines.length) return { error: "Отметьте, что возвращают" };
  const shift = await currentShift(me.id);
  const way = sale.method === "CASH" ? "наличными" : "через ЮKassa";
  try {
    const r = await requestApproval({
      kind: "RETURN",
      sellerId: me.id,
      approverId: String(approverId).slice(0, 64),
      payload: returnPayload(p.data),
      summary: `возврат по чеку ${sale.number} (${lines.reduce((a, l) => a + l.qty, 0)} шт., ${way})${p.data.reason ? `: ${p.data.reason}` : ""}`,
      details: { lines, total: lines.reduce((a, l) => a + l.amount, 0), kassa: me.name, staffName: shift?.staffName ?? null, place: shift?.place ?? sale.place },
    });
    await audit(me.id, "pos.approval_request", "user", r.id, { kind: "RETURN", approver: approverId, sale: sale.number });
    return { id: r.id, approver: r.approver, expiresAt: r.expiresAt.toISOString() };
  } catch (e) {
    return { error: e instanceof ApprovalError ? e.message : "Не получилось отправить запрос" };
  }
}

export async function posApprovalStatus(id: string): Promise<{ status: string }> {
  const { me } = await requireCashier();
  const r = await approvalStatus(String(id).slice(0, 64), me.id);
  return { status: r?.status ?? "CANCELLED" };
}

export async function posApprovalCancel(id: string): Promise<void> {
  const { me } = await requireCashier();
  await cancelApproval(String(id).slice(0, 64), me.id);
}

// ---------- Подарочные сертификаты в кассе

/** Проверить сертификат покупателя: сколько на нём денег */
export async function posGiftCheck(code: string): Promise<{ balance?: number; expiresAt?: string | null; code?: string; error?: string }> {
  const { me } = await requireCashier();
  const { checkGiftCode } = await import("@/lib/giftcards");
  const r = await checkGiftCode(String(code ?? "").slice(0, 40), { ip: null, userId: me.id });
  if ("error" in r) return { error: r.error };
  return { balance: r.card.balance, expiresAt: r.card.expiresAt?.toISOString() ?? null, code: r.card.code };
}

const GiftSellIn = z.object({
  amount: z.number().int().min(100_00, "Номинал — от 100 ₽").max(500_000_00),
  method: z.enum(["CASH", "SBP", "CARD"]),
  contact: z.string().trim().max(200).nullish(),
  recipientEmail: z.string().trim().max(200).nullish(),
});

/** Продать сертификат в кассе */
export async function posGiftSell(raw: unknown): Promise<{ sale?: SaleView; error?: string }> {
  const { me } = await requireCashier();
  const p = GiftSellIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте сертификат" };
  try {
    const shift = await currentShift(me.id);
    if (!shift) return { error: "Сначала откройте смену" };
    const { createGiftSale } = await import("@/lib/pos");
    const { sale } = await createGiftSale(me.id, { ...p.data, place: shift.place, shiftId: shift.id, clubId: shift.clubId });
    await audit(me.id, "pos.gift_sale", "pos_sale", sale.id, { number: sale.number, method: sale.method, amount: sale.total });
    revalidatePath("/", "layout");
    return { sale: await view(sale) };
  } catch (e) {
    if (e instanceof PosError) return { error: e.message };
    console.error("[pos] сертификат:", e);
    return { error: "Не получилось продать сертификат. Попробуйте ещё раз" };
  }
}

// ---------- Выдача заказов с сайта (самовывоз из клуба)

/** Клубы кассира: из его аккаунта, а если не закреплён — клуб открытой смены. Админ — все клубы */
async function pickupClubs(me: { id: string; clubIds: string[] }, admin: boolean) {
  if (admin) return null;
  if (me.clubIds.length) return me.clubIds;
  const shift = await currentShift(me.id);
  return shift?.clubId ? [shift.clubId] : [];
}

export async function posPickupFind(number: string): Promise<{ order?: import("@/lib/pickup").PickupView; error?: string }> {
  const { me, admin } = await requireCashier();
  const { findPickup, PickupError } = await import("@/lib/pickup");
  try {
    return { order: await findPickup(number, await pickupClubs(me, admin)) };
  } catch (e) {
    return { error: e instanceof PickupError ? e.message : "Не получилось найти заказ" };
  }
}

export async function posPickupIssue(orderId: string): Promise<{ ok?: string; error?: string }> {
  const { me, admin } = await requireCashier();
  const { issuePickup, PickupError } = await import("@/lib/pickup");
  try {
    const shift = await currentShift(me.id);
    const number = await issuePickup(orderId, me.id, shift?.staffName ?? null, await pickupClubs(me, admin));
    revalidatePath("/", "layout");
    return { ok: `Заказ ${number} выдан — покупателю ушло письмо` };
  } catch (e) {
    return { error: e instanceof PickupError ? e.message : "Не получилось отметить выдачу" };
  }
}
