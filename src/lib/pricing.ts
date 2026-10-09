/**
 * Расчёт заказа: товары → промокод → бонусы → доставка → итог.
 * Одна функция для корзины, страницы оформления и создания заказа,
 * поэтому покупатель видит ровно ту сумму, которую потом заплатит.
 * Все суммы — в копейках.
 */
import "server-only";
import { and, asc, count, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { calculate, cdekEnabled, parcelFor } from "@/lib/cdek";
import { tierProgress } from "@/lib/loyalty";
import { getSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/settings-defaults";
import type { UserRow } from "@/lib/viewer";
import { isPublic } from "@/lib/visibility";

export interface CartLineInput {
  variantId: string;
  qty: number;
}

export interface DeliveryInput {
  type: "PVZ" | "COURIER";
  cityCode?: number | null;
  cityName?: string | null;
  pvzCode?: string | null;
  pvzAddress?: string | null;
  address?: string | null;
  postalCode?: string | null;
}

export interface QuoteInput {
  lines: CartLineInput[];
  promoCode?: string | null;
  useBonus?: boolean;
  delivery?: DeliveryInput | null;
}

export interface QuoteLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  image: string | null;
  price: number;
  qty: number;
  stock: number;
  lineTotal: number;
  categoryId: string | null;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** Позиции, которые убрали из корзины: товар скрыли, закончился и т. п. */
  removed: { variantId: string; reason: string }[];
  /** Количество уменьшили до остатка */
  adjusted: { variantId: string; name: string; qty: number }[];
  subtotal: number;
  promo: { code: string; label: string; freeShipping: boolean } | null;
  promoError: string | null;
  discount: number;
  bonus: { balance: number; available: number; spent: number; blockedByPromo: boolean };
  shipping: { cost: number; days: string | null; tariff: number | null; free: boolean; estimate: boolean } | null;
  shippingError: string | null;
  total: number;
  accrue: number; // копейки — бонусы за заказ (1 бонус = 100 коп.)
  tierPercent: number;
}

const floorRub = (kop: number) => Math.floor(kop / 100) * 100;

async function loadLines(input: CartLineInput[], settings: SiteSettings) {
  const wanted = new Map<string, number>();
  for (const l of input.slice(0, 50)) {
    const q = Math.trunc(Number(l.qty));
    if (typeof l.variantId === "string" && q > 0) wanted.set(l.variantId, (wanted.get(l.variantId) ?? 0) + q);
  }
  const ids = [...wanted.keys()];
  const removed: Quote["removed"] = [];
  const adjusted: Quote["adjusted"] = [];
  if (!ids.length) return { lines: [] as QuoteLine[], removed, adjusted };

  const rows = await db.query.productVariant.findMany({
    where: inArray(s.productVariant.id, ids),
    with: { product: { with: { category: true, images: { orderBy: asc(s.productImage.sortOrder), limit: 1 } } } },
  });

  // Сколько активных вариантов у каждого товара: если один — название варианта не показываем
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const variantCounts = productIds.length
    ? await db
        .select({ productId: s.productVariant.productId, n: count() })
        .from(s.productVariant)
        .where(and(inArray(s.productVariant.productId, productIds), eq(s.productVariant.isActive, true)))
        .groupBy(s.productVariant.productId)
    : [];

  const lines: QuoteLine[] = [];
  for (const id of ids) {
    const v = rows.find((r) => r.id === id);
    const p = v?.product;
    if (!v || !p || !v.isActive || !isPublic(p) || (p.category && !isPublic(p.category))) {
      removed.push({ variantId: id, reason: "Товар больше не продаётся" });
      continue;
    }
    if (v.stock <= 0) {
      removed.push({ variantId: id, reason: `«${p.name}» закончился` });
      continue;
    }
    let qty = wanted.get(id)!;
    const max = Math.min(v.stock, settings.checkout.maxQtyPerItem);
    if (qty > max) {
      qty = max;
      adjusted.push({ variantId: id, name: p.name, qty });
    }
    const price = v.price ?? p.price;
    const single = (variantCounts.find((c) => c.productId === p.id)?.n ?? 1) <= 1;
    lines.push({
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      variantName: single ? null : v.name,
      sku: v.sku ?? p.sku ?? p.slug,
      image: p.images[0]?.url ?? null,
      price,
      qty,
      stock: v.stock,
      lineTotal: price * qty,
      categoryId: p.categoryId,
      weightGrams: p.weightGrams,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
    });
  }
  return { lines, removed, adjusted };
}

type PromoRow = typeof s.promoCode.$inferSelect;

/** Проверка промокода. Возвращает строку промокода или текст ошибки для покупателя. */
export async function checkPromo(code: string, user: UserRow | null, subtotal: number): Promise<PromoRow | string> {
  const p = await db.query.promoCode.findFirst({ where: eq(s.promoCode.code, code.trim().toUpperCase()) });
  const now = new Date();
  if (!p || !p.isActive) return "Такого промокода нет";
  if (p.startsAt && p.startsAt > now) return "Промокод ещё не действует";
  if (p.endsAt && p.endsAt < now) return "Срок действия промокода закончился";
  if (p.maxUses != null && p.usedCount >= p.maxUses) return "Промокод уже использовали максимальное число раз";
  if (p.minOrder && subtotal < p.minOrder) return `Промокод действует от ${Math.ceil(p.minOrder / 100)} ₽`;
  if (!user) return "Войдите, чтобы применить промокод";
  if (p.maxUsesPerUser != null) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(s.promoUsage)
      .innerJoin(s.order, eq(s.order.id, s.promoUsage.orderId))
      .where(and(eq(s.promoUsage.promoId, p.id), eq(s.promoUsage.userId, user.id), notInArray(s.order.status, ["CANCELLED"])));
    if (n >= p.maxUsesPerUser) return "Вы уже использовали этот промокод";
  }
  if (p.firstOrderOnly) {
    const n = await db.$count(s.order, and(eq(s.order.userId, user.id), ne(s.order.status, "CANCELLED")));
    if (n > 0) return "Промокод действует только на первый заказ";
  }
  return p;
}

export async function computeQuote(input: QuoteInput, user: UserRow | null): Promise<Quote> {
  const settings = await getSettings();
  const { lines, removed, adjusted } = await loadLines(input.lines ?? [], settings);
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);

  // ---- Промокод
  let promo: Quote["promo"] = null;
  let promoRow: PromoRow | null = null;
  let promoError: string | null = null;
  let discount = 0;
  if (input.promoCode?.trim() && lines.length) {
    const r = await checkPromo(input.promoCode, user, subtotal);
    if (typeof r === "string") promoError = r;
    else {
      const eligible = r.categoryId ? lines.filter((l) => l.categoryId === r.categoryId).reduce((a, l) => a + l.lineTotal, 0) : subtotal;
      if (r.categoryId && eligible === 0) promoError = "Промокод не действует на товары в корзине";
      else {
        promoRow = r;
        if (r.type === "PERCENT") discount = floorRub((eligible * Math.min(100, r.value)) / 100);
        else if (r.type === "FIXED") discount = Math.min(r.value, eligible);
        const label =
          r.type === "PERCENT" ? `−${r.value}%` : r.type === "FIXED" ? `−${Math.round(r.value / 100)} ₽` : "Бесплатная доставка";
        promo = { code: r.code, label, freeShipping: r.type === "FREE_SHIPPING" };
      }
    }
  }
  // Оставляем минимум 1 ₽ за товары — меньше ЮKassa не принимает
  discount = Math.min(discount, Math.max(0, subtotal - 100));
  const afterDiscount = subtotal - discount;

  // ---- Бонусы
  const balance = user?.bonusBalance ?? 0;
  const blockedByPromo = !!promoRow && !promoRow.combinableWithBonus;
  const byPercent = floorRub((afterDiscount * settings.loyalty.maxSpendPercent) / 100);
  const available = blockedByPromo ? 0 : Math.max(0, Math.min(balance * 100, byPercent, floorRub(afterDiscount - 100)));
  const bonusSpent = input.useBonus ? available : 0;
  const goods = afterDiscount - bonusSpent;

  // ---- Доставка
  let shipping: Quote["shipping"] = null;
  let shippingError: string | null = null;
  const d = input.delivery;
  if (d && lines.length) {
    const st = settings.delivery;
    const tariff = d.type === "PVZ" ? st.tariffPvz : st.tariffCourier;
    const free = (st.freeFrom > 0 && afterDiscount >= st.freeFrom * 100) || !!promo?.freeShipping;
    if (d.type === "PVZ" && !st.pvzEnabled) shippingError = "Доставка в пункт выдачи сейчас недоступна";
    else if (d.type === "COURIER" && !st.courierEnabled) shippingError = "Доставка курьером сейчас недоступна";
    else if (cdekEnabled()) {
      if (!d.cityCode) shippingError = "Выберите город";
      else {
        try {
          const q = await calculate({ fromCityCode: st.fromCityCode, toCityCode: d.cityCode, tariff, parcel: parcelFor(lines.map((l) => ({ ...l, quantity: l.qty }))) });
          const days = q.periodMin === q.periodMax ? `${q.periodMax}` : `${q.periodMin}–${q.periodMax}`;
          shipping = { cost: free ? 0 : q.cost + st.markup * 100, days, tariff, free, estimate: false };
        } catch (e) {
          console.error("[cdek] calculate:", e);
          shippingError = "СДЭК не смог рассчитать доставку в этот город. Попробуйте другой способ или напишите в поддержку";
        }
      }
    } else {
      const flat = (d.type === "PVZ" ? st.flatPvz : st.flatCourier) * 100;
      shipping = { cost: free ? 0 : flat, days: null, tariff, free, estimate: true };
    }
  }

  const tier = tierProgress(Math.floor((user?.totalSpent ?? 0) / 100), settings.loyalty).current;
  const tierPercent = settings.loyalty.tiers[tier].percent;
  const accrue = user ? Math.floor((goods * tierPercent) / 100 / 100) * 100 : 0;

  return {
    lines,
    removed,
    adjusted,
    subtotal,
    promo,
    promoError,
    discount,
    bonus: { balance, available: Math.floor(available / 100), spent: bonusSpent, blockedByPromo },
    shipping,
    shippingError,
    total: goods + (shipping?.cost ?? 0),
    accrue,
    tierPercent,
  };
}
