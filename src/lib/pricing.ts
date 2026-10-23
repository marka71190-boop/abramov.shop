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
import { checkGiftCode, giftApplicable } from "@/lib/giftcards";
import { getSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/settings-defaults";
import type { UserRow } from "@/lib/viewer";
import { isPublic, isRetail } from "@/lib/visibility";
import { isCueKey } from "@/lib/cue-config";
import { cueLine } from "@/lib/cue";
import { approvedOrg, isWholesaleKey, WHOLESALE_PREFIX, wholesalePriceOf } from "@/lib/wholesale";

export interface CartLineInput {
  variantId: string;
  qty: number;
}

export interface DeliveryInput {
  type: "PVZ" | "COURIER" | "PICKUP";
  /** Самовывоз: из какого клуба */
  clubId?: string | null;
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
  /** Код подарочного сертификата */
  giftCode?: string | null;
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
  /** Ссылка на позицию (по умолчанию — страница товара) */
  href?: string;
  /** Кий на заказ: спецификация для мастерской и срок изготовления, дней */
  spec?: string;
  /** Лимитированный товар */
  limited?: boolean;
  /** Оптовая позиция: variantId — ключ корзины «w:…», настоящий вариант — variantRef */
  wholesale?: boolean;
  variantRef?: string;
  /** Минимальная партия (опт) */
  minQty?: number;
  madeToOrder?: number;
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
  /** Скидка по промокоду */
  discount: number;
  /** Скидка за собранные комплекты */
  bundleDiscount: number;
  bundles: { id: string; name: string; percent: number; sets: number; discount: number }[];
  /** Почти собранный комплект: чего не хватает до скидки */
  bundleHints: { id: string; name: string; percent: number; missing: { name: string; slug: string }[] }[];
  bonus: { balance: number; available: number; spent: number; blockedByPromo: boolean };
  shipping: { cost: number; days: string | null; tariff: number | null; free: boolean; estimate: boolean } | null;
  shippingError: string | null;
  /** Итог заказа (товары после скидок + доставка) */
  total: number;
  /** Подарочный сертификат: сколько спишется с него */
  gift: { code: string; balance: number; applied: number; expiresAt: string | null } | null;
  giftError: string | null;
  /** Сколько платить онлайн: total − gift.applied */
  payable: number;
  accrue: number; // копейки — бонусы за заказ (1 бонус = 100 коп.)
  tierPercent: number;
  /** Опт: сумма оптовых позиций, можно ли платить по счёту, ошибка (минимальная сумма) */
  wholesale: { sum: number; invoice: boolean; error: string | null; org: string | null };
}

const floorRub = (kop: number) => Math.floor(kop / 100) * 100;

async function loadLines(input: CartLineInput[], settings: SiteSettings, org: { id: string } | null) {
  const wanted = new Map<string, number>();
  for (const l of input.slice(0, 50)) {
    const q = Math.trunc(Number(l.qty));
    if (typeof l.variantId === "string" && q > 0) wanted.set(l.variantId, (wanted.get(l.variantId) ?? 0) + q);
  }
  const removed: Quote["removed"] = [];
  const adjusted: Quote["adjusted"] = [];
  // Кий «Чемпион» на заказ: цена по сборке, без остатков
  const cueLines: QuoteLine[] = [];
  for (const key of [...wanted.keys()].filter(isCueKey)) {
    let qty = wanted.get(key)!;
    wanted.delete(key);
    const r = await cueLine(key, qty);
    if ("error" in r) {
      removed.push({ variantId: key, reason: r.error! });
      continue;
    }
    if (qty > settings.checkout.maxQtyPerItem) {
      qty = settings.checkout.maxQtyPerItem;
      adjusted.push({ variantId: key, name: r.line.name, qty });
    }
    cueLines.push({ ...r.line, qty, lineTotal: r.line.price * qty });
  }
  const ids = [...wanted.keys()];
  if (!ids.length) return { lines: cueLines, removed, adjusted };
  const realId = (k: string) => (isWholesaleKey(k) ? k.slice(WHOLESALE_PREFIX.length) : k);

  const rows = await db.query.productVariant.findMany({
    where: inArray(s.productVariant.id, [...new Set(ids.map(realId))]),
    with: { product: { with: { category: true, images: { orderBy: asc(s.productImage.sortOrder), limit: 30 } } } },
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

  const lines: QuoteLine[] = [...cueLines];
  for (const id of ids) {
    const opt = isWholesaleKey(id);
    const v = rows.find((r) => r.id === realId(id));
    const p = v?.product;
    if (!v || !p || !v.isActive || !isPublic(p) || (p.category && !isPublic(p.category))) {
      removed.push({ variantId: id, reason: "Товар больше не продаётся" });
      continue;
    }
    // Розница не покупает «только опт», опт — только одобренные организации и только оптовые товары
    if (!opt && p.channel === "WHOLESALE") {
      removed.push({ variantId: id, reason: `«${p.name}» продаётся только оптом` });
      continue;
    }
    if (opt && (!org || p.channel === "RETAIL")) {
      removed.push({ variantId: id, reason: org ? `«${p.name}» больше не продаётся оптом` : "Оптовые цены доступны только одобренным организациям" });
      continue;
    }
    if (v.stock <= 0) {
      removed.push({ variantId: id, reason: `«${p.name}» закончился` });
      continue;
    }
    let qty = wanted.get(id)!;
    const minQty = opt ? Math.max(1, p.wholesaleMin) : 1;
    if (opt && v.stock < minQty) {
      removed.push({ variantId: id, reason: `«${p.name}»: на складе меньше минимальной партии (${minQty} шт.)` });
      continue;
    }
    const max = opt ? Math.min(v.stock, 9999) : Math.min(v.stock, settings.checkout.maxQtyPerItem);
    if (qty > max) {
      qty = max;
      adjusted.push({ variantId: id, name: p.name, qty });
    }
    if (qty < minQty) {
      qty = minQty;
      adjusted.push({ variantId: id, name: `${p.name} — минимальная партия`, qty });
    }
    const price = opt ? wholesalePriceOf(p, v) : (v.price ?? p.price);
    const single = (variantCounts.find((c) => c.productId === p.id)?.n ?? 1) <= 1;
    lines.push({
      variantId: id,
      ...(opt ? { wholesale: true, variantRef: v.id, href: "/opt", minQty } : {}),
      productId: p.id,
      slug: p.slug,
      name: p.name,
      variantName: single ? null : v.name,
      sku: v.sku ?? p.sku ?? p.slug,
      // Фото выбранного варианта, иначе общее фото товара
      image: (p.images.find((im) => im.variantId === v.id) ?? p.images.find((im) => !im.variantId) ?? p.images[0])?.url ?? null,
      price,
      qty,
      stock: v.stock,
      lineTotal: price * qty,
      categoryId: p.categoryId,
      weightGrams: p.weightGrams,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      limited: p.isLimited,
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
  if (p.ownerUserId && p.ownerUserId !== user.id) return "Это персональный промокод другого покупателя";
  if (p.personalHours) {
    const { personalDeadline } = await import("@/lib/promo-timer");
    const until = await personalDeadline(p, user.id);
    if (!until) return "Этот промокод — для получателей рассылки: войдите в аккаунт, на почту которого пришло письмо";
    if (until < now) return "Время акции закончилось — промокод больше не действует";
  }
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
  const org = await approvedOrg(user);
  const { lines, removed, adjusted } = await loadLines(input.lines ?? [], settings, org);
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  // Оптовые позиции: без промокодов, комплектов и бонусов
  const wholesaleSum = lines.filter((l) => l.wholesale).reduce((a, l) => a + l.lineTotal, 0);
  const wholesaleError =
    wholesaleSum > 0 && settings.b2b.minOrder > 0 && wholesaleSum < settings.b2b.minOrder * 100
      ? `Минимальная сумма оптового заказа — ${settings.b2b.minOrder.toLocaleString("ru-RU")} ₽`
      : null;

  // ---- Комплекты со скидкой
  const { activeBundles, applyBundles } = await import("@/lib/bundles");
  const br = lines.length ? applyBundles(lines.filter((l) => !l.wholesale), await activeBundles()) : { discount: 0, applied: [], cut: new Map<string, number>(), hints: [] };
  const bundleDiscount = Math.min(br.discount, Math.max(0, subtotal - 100));
  let bundleHints: Quote["bundleHints"] = [];
  if (br.hints.length) {
    const ids = [...new Set(br.hints.flatMap((h) => h.missing))];
    const prods = await db.query.product.findMany({ where: inArray(s.product.id, ids), with: { category: true } });
    bundleHints = br.hints
      .map((h) => ({
        id: h.id,
        name: h.name,
        percent: h.percent,
        missing: h.missing.map((pid) => prods.find((p) => p.id === pid)).filter((p) => p && isRetail(p) && (!p.category || isPublic(p.category))).map((p) => ({ name: p!.name, slug: p!.slug })),
      }))
      .filter((h, i, a) => h.missing.length > 0 && a.findIndex((x) => x.id === h.id) === i)
      .slice(0, 2);
  }
  const afterBundle = (l: QuoteLine) => l.lineTotal - (br.cut.get(l.variantId) ?? 0);

  // ---- Промокод
  let promo: Quote["promo"] = null;
  let promoRow: PromoRow | null = null;
  let promoError: string | null = null;
  let discount = 0;
  if (input.promoCode?.trim() && lines.length && lines.every((l) => l.wholesale)) {
    promoError = "Промокоды не действуют на оптовые цены";
  } else if (input.promoCode?.trim() && lines.length) {
    const r = await checkPromo(input.promoCode, user, subtotal - bundleDiscount - wholesaleSum);
    if (typeof r === "string") promoError = r;
    else {
      const fits = (l: QuoteLine) => !l.wholesale && (!r.categoryId || l.categoryId === r.categoryId) && !(r.excludeSpecial && (l.limited || l.spec));
      // Промокод — от цены после скидки за комплект
      const eligible = Math.floor(lines.filter(fits).reduce((a, l) => a + afterBundle(l), 0));
      if (r.categoryId && eligible === 0) promoError = "Промокод не действует на товары в корзине";
      else if (r.excludeSpecial && eligible === 0 && r.type !== "FREE_SHIPPING") promoError = "Промокод не действует на лимитированные товары и кий на заказ";
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
  discount = Math.min(discount, Math.max(0, subtotal - bundleDiscount - 100));
  const afterDiscount = subtotal - bundleDiscount - discount;

  // ---- Бонусы
  const balance = user?.bonusBalance ?? 0;
  const blockedByPromo = !!promoRow && !promoRow.combinableWithBonus;
  // Бонусами платят только за розничные товары
  const retailAfter = Math.max(0, afterDiscount - wholesaleSum);
  const byPercent = floorRub((retailAfter * settings.loyalty.maxSpendPercent) / 100);
  const available = blockedByPromo ? 0 : Math.max(0, Math.min(balance * 100, byPercent, floorRub(afterDiscount - 100)));
  const bonusSpent = input.useBonus ? available : 0;
  const goods = afterDiscount - bonusSpent;

  // ---- Доставка
  let shipping: Quote["shipping"] = null;
  let shippingError: string | null = null;
  const d = input.delivery;
  if (d && lines.length && d.type === "PICKUP") {
    // Самовывоз из клуба — бесплатно
    const { getClub } = await import("@/lib/clubs");
    const club = await getClub(d.clubId);
    if (!settings.delivery.pickupEnabled) shippingError = "Самовывоз сейчас недоступен";
    else if (!club || !club.isActive || !club.pickup) shippingError = "Выберите клуб, где заберёте заказ";
    else shipping = { cost: 0, days: null, tariff: null, free: true, estimate: false };
  } else if (d && lines.length) {
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
  const accrue = user ? Math.floor((Math.max(0, goods - wholesaleSum) * tierPercent) / 100 / 100) * 100 : 0;

  const total = goods + (shipping?.cost ?? 0);

  // ---- Подарочный сертификат — как деньги: покрывает итог вместе с доставкой
  let gift: Quote["gift"] = null;
  let giftError: string | null = null;
  if (input.giftCode?.trim() && lines.length) {
    const r = await checkGiftCode(input.giftCode);
    if ("error" in r) giftError = r.error;
    else {
      const applied = shipping || !d ? giftApplicable(r.card.balance, total) : 0;
      gift = { code: r.card.code, balance: r.card.balance, applied, expiresAt: r.card.expiresAt?.toISOString() ?? null };
    }
  }

  return {
    lines,
    removed,
    adjusted,
    subtotal,
    promo,
    promoError,
    discount,
    bundleDiscount,
    bundles: br.applied,
    bundleHints,
    bonus: { balance, available: Math.floor(available / 100), spent: bonusSpent, blockedByPromo },
    shipping,
    shippingError,
    total,
    gift,
    giftError,
    payable: total - (gift?.applied ?? 0),
    accrue,
    tierPercent,
    wholesale: { sum: wholesaleSum, invoice: !!org && !!settings.b2b.enabled && !!settings.b2b.account && !!settings.b2b.bik, error: wholesaleError, org: org?.name ?? null },
  };
}
