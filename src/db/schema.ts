/**
 * Abramov Shop — схема базы данных (PostgreSQL, Drizzle ORM).
 *
 * Все суммы денег — в КОПЕЙКАХ (целые числа), чтобы не было ошибок округления.
 * Бонусы — в бонусах (1 бонус = 1 ₽).
 *
 * После изменения этого файла: npm run db:generate (создаст SQL-миграцию в /drizzle),
 * затем npm run db:migrate.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ============================================================
// Пользователи и вход. Таблицы user/session/account/verification
// использует библиотека входа Better Auth — их поля не переименовывать.
// ============================================================

// CLUB — администратор клуба: видит только выдачу заказов и приём киёв своего клуба
// CASHIER — кассир: видит только кассу (/kassa)
// DIRECTOR — руководитель: смотрит отчёты (финансы, аналитика, заказы, склад), ничего не меняет
export const roleEnum = pgEnum("role", ["CUSTOMER", "MANAGER", "OWNER", "CLUB", "COACH", "CASHIER", "DIRECTOR"]);
export const tierEnum = pgEnum("loyalty_tier", ["SILVER", "GOLD", "BLACK"]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),

    phone: text("phone"),
    patronymic: text("patronymic"),
    callName: text("call_name"), // как обращаться — человек указал сам в кабинете // отчество — для обращения «Здравствуйте, Имя Отчество»
    birthday: date("birthday"),
    birthdaySetAt: ts("birthday_set_at"), // когда указал — подарок только если указал заранее
    birthdayBonusYear: integer("birthday_bonus_year"), // год, за который подарок уже выдан
    bonusReminderAt: ts("bonus_reminder_at"), // последнее напоминание о сгорающих бонусах
    role: roleEnum("role").default("CUSTOMER").notNull(),
    clubId: text("club_id"), // для роли CLUB: в каком клубе работает
    adminSections: text("admin_sections").array(), // менеджер: какие разделы админки видит; пусто — все
    clubIds: text("club_ids").array().default(sql`'{}'::text[]`).notNull(), // кассир: в каких клубах работает (пусто — где угодно)
    extraRoles: text("extra_roles").array().default(sql`'{}'::text[]`).notNull(), // дополнительные роли (тренер + кассир…), главная — в role
    isDevice: boolean("is_device").default(false).notNull(), // рабочий телефон кассы: только касса своего клуба, без заказов и кабинета
    // PIN менеджера (6 цифр) — подтверждает в кассе скидку сверх лимита и возврат. Хранится только хеш
    pinHash: text("pin_hash"),
    pinSetAt: ts("pin_set_at"),
    pinFailed: integer("pin_failed").default(0).notNull(), // неверных вводов подряд
    pinLockedAt: ts("pin_locked_at"), // заблокирован: 5 ошибок или «это был не я» из письма
    organizationId: text("organization_id"), // сотрудник организации-оптовика
    country: text("country").default("RU").notNull(), // куда доставлять: код страны; XX — страны нет в списке СДЭК, вписал сам
    countryName: text("country_name"), // название страны, если вписал сам
    tin: text("tin"), // ИИН (Казахстан) или ПИН (Киргизия) — для таможни СДЭК

    // Блокировка: bannedAt заполнен, bannedUntil пуст — бан навсегда.
    bannedAt: ts("banned_at"),
    bannedUntil: ts("banned_until"),
    banReason: text("ban_reason"),
    banTicket: text("ban_ticket").unique(), // номер обращения для поддержки
    bannedById: text("banned_by_id"),

    // Бонусы и уровни
    bonusBalance: integer("bonus_balance").default(0).notNull(),
    tier: tierEnum("tier").default("SILVER").notNull(),
    totalSpent: integer("total_spent").default(0).notNull(), // копейки, по полученным заказам
    referralCode: text("referral_code").unique(),
    referredById: text("referred_by_id"),

    // Уведомления
    telegramChatId: text("telegram_chat_id"),
    notifyTelegram: boolean("notify_telegram").default(true).notNull(),
  },
  (t) => [index("user_phone_idx").on(t.phone)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Вход по Face ID / Touch ID / отпечатку (passkey): открытый ключ устройства, секрет остаётся в телефоне */
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: ts("created_at"),
    aaguid: text("aaguid"),
  },
  (t) => [index("passkey_user_idx").on(t.userId), index("passkey_credential_idx").on(t.credentialID)],
);

// ============================================================
// Журнал согласий (152-ФЗ). Записи никогда не удаляются:
// отзыв согласия — отметка revokedAt, а не удаление строки.
// ============================================================

export const consentKindEnum = pgEnum("consent_kind", [
  "PERSONAL_DATA", // обработка персональных данных
  "MARKETING", // рекламные рассылки
  "COACH_TRANSFER", // передача имени и телефона тренеру при записи на тренировку
]);

export const consentSourceEnum = pgEnum("consent_source", [
  "REGISTRATION", // форма регистрации по почте
  "GOOGLE", // кнопка «Продолжить с Google»
  "VK", // кнопка «Продолжить с VK ID»
  "CHECKOUT", // оформление заказа
  "ACCOUNT", // включил в личном кабинете
  "RECONSENT", // повторное согласие (новая редакция документа или старый аккаунт)
  "TRAINING", // запись на тренировку
]);

/** Редакции текстов согласий. Хеш не даёт «тихо» подменить текст задним числом. */
export const consentDocument = pgTable("consent_document", {
  id: id(),
  kind: consentKindEnum("kind").notNull(),
  version: text("version").notNull(), // например «2026-10-09»
  title: text("title").notNull(),
  body: text("body").notNull(),
  sha256: text("sha256").notNull(),
  isCurrent: boolean("is_current").default(false).notNull(),
  createdAt: createdAt(),
});

export const consent = pgTable(
  "consent",
  {
    id: id(),
    kind: consentKindEnum("kind").notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => consentDocument.id),
    source: consentSourceEnum("source").notNull(),

    // Кто дал согласие — на момент отметки галочки
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),

    // Доказательства
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),

    // Галочку ставят ДО входа через Google: связываем с аккаунтом после возврата
    linkToken: text("link_token"),
    linkedAt: ts("linked_at"),

    revokedAt: ts("revoked_at"),
    revokeIp: text("revoke_ip"),

    // Кому разрешена передача (для COACH_TRANSFER — тренер)
    recipientId: text("recipient_id"),
    recipientName: text("recipient_name"),
  },
  (t) => [
    index("consent_user_idx").on(t.userId),
    index("consent_phone_idx").on(t.phone),
    index("consent_email_idx").on(t.email),
    index("consent_created_idx").on(t.createdAt),
    index("consent_link_idx").on(t.linkToken),
  ],
);

// ============================================================
// Контент: страницы, категории, товары. У всего есть видимость:
//   DRAFT — черновик, HIDDEN — скрыто, PUBLISHED — открыто
//   (если задан publishAt — откроется само в это время).
// Скрытое видят только админы и те, у кого ссылка предпросмотра.
// ============================================================

export const visibilityEnum = pgEnum("visibility", ["DRAFT", "HIDDEN", "PUBLISHED"]);
export type Visibility = (typeof visibilityEnum.enumValues)[number];

const previewToken = () =>
  text("preview_token")
    .notNull()
    .unique()
    .$defaultFn(() => crypto.randomUUID());

export const page = pgTable("page", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  visibility: visibilityEnum("visibility").default("DRAFT").notNull(),
  publishAt: ts("publish_at"),
  previewToken: previewToken(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  showInFooter: boolean("show_in_footer").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const category = pgTable("category", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  parentId: text("parent_id"),
  visibility: visibilityEnum("visibility").default("DRAFT").notNull(),
  publishAt: ts("publish_at"),
  previewToken: previewToken(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const product = pgTable("product", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Слова для поиска: другие написания, бренд по-русски, частые ошибки. Покупателю не показываются
  searchTags: text("search_tags").notNull().default(""),
  categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
  price: integer("price").notNull(), // копейки
  oldPrice: integer("old_price"),
  sku: text("sku").unique(),
  oldSku: text("old_sku"), // артикул до перехода «артикул = штрихкод»: по нему находим старые файлы и этикетки
  visibility: visibilityEnum("visibility").default("DRAFT").notNull(),
  publishAt: ts("publish_at"),
  previewToken: previewToken(),
  isLimited: boolean("is_limited").default(false).notNull(),
  limitedTotal: integer("limited_total"),
  isUnique: boolean("is_unique").default(false).notNull(), // штучный экземпляр (кий ручной работы): продан — показываем «Продан» и похожие
  // Габариты для расчёта доставки СДЭК
  weightGrams: integer("weight_grams").default(300).notNull(),
  lengthCm: integer("length_cm").default(10).notNull(),
  widthCm: integer("width_cm").default(10).notNull(),
  heightCm: integer("height_cm").default(10).notNull(),
  // Для таможни (инвойс Почты России, международные отправления СДЭК)
  nameEn: text("name_en"), // описание по-английски: «Billiard cue»
  hsCode: text("hs_code"), // код ТН ВЭД, 6–10 цифр
  originCountry: text("origin_country"), // страна производства, код: RU, CN…
  // Где продаётся: RETAIL — розница, WHOLESALE — только оптовый каталог, BOTH — и там и там
  channel: text("channel").default("RETAIL").notNull(),
  wholesalePrice: integer("wholesale_price"), // оптовая цена, копейки; пусто — как в рознице
  wholesaleMin: integer("wholesale_min").default(1).notNull(), // минимальная партия, шт.
  // Видеообзоры: VK Видео, Rutube, YouTube
  videos: jsonb("videos").$type<{ url: string; title: string }[]>().default([]).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const productVariant = pgTable("product_variant", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // «Чёрный, M»
  sku: text("sku").unique(),
  oldSku: text("old_sku"), // прежний артикул — старые этикетки и файлы Excel по нему тоже находятся
  // Штрихкод EAN-13: свой магазинный (200…) — сайт выдаёт сам, или заводской с упаковки. Сканер ищет и по нему, и по артикулу
  barcode: text("barcode").unique(),
  price: integer("price"), // если отличается от цены товара, копейки
  stock: integer("stock").default(0).notNull(),
  bin: text("bin"), // ячейка на складе: «A-3» — где лежит; наклейка с QR на полке открывает её содержимое
  costPrice: integer("cost_price"), // закупочная цена за 1 шт., копейки (средняя по приходам); пусто — не указана
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  lowStockNotifiedAt: ts("low_stock_notified_at"), // уже предупредили админов, что заканчивается
});

/** Характеристики товаров: вес, длина, диаметр наклейки, бренд… — для карточки, фильтров и сравнения */
export const attribute = pgTable("attribute", {
  id: id(),
  key: text("key").notNull().unique(), // латиницей, для адреса фильтра: weight, brand
  name: text("name").notNull(), // «Вес»
  unit: text("unit").default("").notNull(), // «г»
  type: text("type").notNull(), // number | select | text
  options: text("options").array().default([]).notNull(), // варианты для select
  categoryIds: text("category_ids").array().default([]).notNull(), // пусто — для всех категорий
  filterable: boolean("filterable").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
});

export const productAttribute = pgTable(
  "product_attribute",
  {
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    attributeId: text("attribute_id")
      .notNull()
      .references(() => attribute.id, { onDelete: "cascade" }),
    value: text("value").notNull(), // число — с точкой: «12.5»
  },
  (t) => [primaryKey({ columns: [t.productId, t.attributeId] }), index("product_attribute_attr_idx").on(t.attributeId)],
);

/**
 * Карточка товара у поставщика («Фортуна», fortu.ru): что нашли и какие характеристики там указаны.
 * По ней заполняются характеристики и пишется описание. Тексты и фото поставщика не копируются.
 */
export const supplierCard = pgTable("supplier_card", {
  productId: text("product_id")
    .primaryKey()
    .references(() => product.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // FOUND — нашли, ждёт проверки; APPLIED — заполнили; NONE — не нашли; SKIP — не трогать
  url: text("url"),
  code: text("code"), // код товара у поставщика
  title: text("title"),
  score: integer("score").default(0).notNull(), // насколько название совпало с нашим, 0–100
  specs: jsonb("specs").$type<{ name: string; value: string }[]>().default([]).notNull(),
  rrp: integer("rrp"), // рекомендованная розничная цена, копейки
  note: text("note"), // почему не нашли или что пошло не так
  fetchedAt: ts("fetched_at"),
  updatedAt: updatedAt(),
});

/** Комплект со скидкой: если в корзине все товары комплекта — скидка на них */
export const bundle = pgTable("bundle", {
  id: id(),
  name: text("name").notNull(), // «Стартовый набор: кий + чехол + мел»
  note: text("note").default("").notNull(),
  productIds: text("product_ids").array().default([]).notNull(), // 2–6 товаров, по одному каждого
  percent: integer("percent").notNull(), // скидка на товары комплекта, %
  level: text("level").default("").notNull(), // для кого: BEGINNER — новичку, PLAYER — игроку, PRO — профи; пусто — всем
  showcase: boolean("showcase").default(true).notNull(), // показывать на странице «Наборы»
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
});

/** «С этим покупают» — подборка, заданная вручную в карточке товара */
export const productRelated = pgTable(
  "product_related",
  {
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    relatedId: text("related_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.relatedId] })],
);

export const productImage = pgTable("product_image", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  // Фото конкретного варианта (цвет, рука…). Пусто — общее фото товара
  variantId: text("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  alt: text("alt").default("").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

// ============================================================
// Заказы, оплаты ЮKassa, доставка СДЭК
// ============================================================

export const orderStatusEnum = pgEnum("order_status", [
  "AWAITING_PAYMENT",
  "PAID",
  "ASSEMBLING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "WAITING_FOR_CAPTURE",
  "SUCCEEDED",
  "CANCELED",
  "REFUNDED",
]);

export const promoTypeEnum = pgEnum("promo_type", [
  "PERCENT", // value — проценты
  "FIXED", // value — копейки
  "FREE_SHIPPING",
]);

export const promoCode = pgTable("promo_code", {
  id: id(),
  code: text("code").notNull().unique(),
  type: promoTypeEnum("type").notNull(),
  value: integer("value").default(0).notNull(),
  minOrder: integer("min_order"), // копейки
  maxUses: integer("max_uses"),
  maxUsesPerUser: integer("max_uses_per_user").default(1),
  usedCount: integer("used_count").default(0).notNull(),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  isActive: boolean("is_active").default(true).notNull(),
  firstOrderOnly: boolean("first_order_only").default(false).notNull(),
  categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
  combinableWithBonus: boolean("combinable_with_bonus").default(true).notNull(),
  /** Акция по таймеру: действует столько часов с момента, когда письмо рассылки пришло покупателю, и только получателям */
  personalHours: integer("personal_hours"),
  /** Персональный промокод — подходит только этому покупателю (например, за брошенную корзину) */
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  /** Скидка не действует на лимитированные товары и кий на заказ */
  excludeSpecial: boolean("exclude_special").default(false).notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

export const order = pgTable(
  "order",
  {
    id: id(),
    number: text("number").notNull().unique(), // AS-261009-7QX4
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: orderStatusEnum("status").default("AWAITING_PAYMENT").notNull(),

    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    comment: text("comment"),

    // Суммы в копейках
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").default(0).notNull(), // промокод
    bundleDiscount: integer("bundle_discount").default(0).notNull(), // скидка за комплекты
    bonusSpent: integer("bonus_spent").default(0).notNull(),
    shippingCost: integer("shipping_cost").default(0).notNull(),
    total: integer("total").notNull(), // итог заказа; онлайн платится total − giftCardAmount
    giftCardAmount: integer("gift_card_amount").default(0).notNull(), // оплачено подарочным сертификатом
    bonusAccrued: integer("bonus_accrued").default(0).notNull(),

    promoCodeId: text("promo_code_id").references(() => promoCode.id, { onDelete: "set null" }),

    // Оплата: ONLINE — ЮKassa, INVOICE — по счёту для организации, ROBOKASSA — из-за рубежа, TRANSFER — перевод на карту
    paymentMethod: text("payment_method").default("ONLINE").notNull(),
    country: text("country").default("RU").notNull(), // страна доставки (код; XX — вписал покупатель)
    countryName: text("country_name"),
    recipientTin: text("recipient_tin"), // ИИН / ПИН получателя — для таможни (Казахстан, Киргизия)
    foreignFee: integer("foreign_fee").default(0).notNull(), // сбор за заказ из-за рубежа, копейки (входит в total)
    foreignPercent: integer("foreign_percent").default(0).notNull(), // его процент на момент заказа
    shippingPending: boolean("shipping_pending").default(false).notNull(), // доставку считает менеджер — оплата после расчёта
    organizationId: text("organization_id"),

    // Доставка
    deliveryType: text("delivery_type"), // PVZ | COURIER | PICKUP (самовывоз из клуба)
    pickupClubId: text("pickup_club_id"), // самовывоз: из какого клуба
    city: text("city"),
    postalCode: text("postal_code"),
    address: text("address"),
    cdekPvzCode: text("cdek_pvz_code"),
    cdekCityCode: integer("cdek_city_code"),
    deliveryTariff: integer("delivery_tariff"),
    deliveryCost: integer("delivery_cost"), // сколько доставка стоит магазину (тариф СДЭК без наценки), копейки
    deliveryDays: text("delivery_days"), // «2–4» — срок по расчёту СДЭК
    cdekOrderUuid: text("cdek_order_uuid"),
    cdekStatus: text("cdek_status"), // последний статус из СДЭК
    trackNumber: text("track_number"),

    bonusCredited: boolean("bonus_credited").default(false).notNull(), // бонусы за заказ уже начислены
    reviewRequestedAt: ts("review_requested_at"), // письмо «оцените покупку» отправлено
    cancelReason: text("cancel_reason"),
    expiresAt: ts("expires_at"), // до какого времени ждём оплату

    paidAt: ts("paid_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("order_user_idx").on(t.userId),
    index("order_status_idx").on(t.status),
    index("order_created_idx").on(t.createdAt),
  ],
);

export const orderItem = pgTable("order_item", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
  variantId: text("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  name: text("name").notNull(), // название на момент покупки
  price: integer("price").notNull(), // копейки за 1 шт.
  quantity: integer("quantity").notNull(),
  spec: text("spec"), // кий на заказ: параметры сборки, по строке «Группа: значение»
  cueKey: text("cue_key"), // кий на заказ: код сборки (без гравировки) — чтобы «собрать такой же»
  wholesale: boolean("wholesale").default(false).notNull(), // куплено по оптовой цене
  unitCost: integer("unit_cost"), // себестоимость 1 шт. на момент заказа, копейки (для прибыли)
});

export const orgStatusEnum = pgEnum("org_status", ["PENDING", "APPROVED", "REJECTED", "BLOCKED"]);

/** Организация-оптовик: клуб, магазин. Подаёт заявку, после одобрения видит оптовый каталог */
export const organization = pgTable(
  "organization",
  {
    id: id(),
    inn: text("inn").notNull().unique(),
    kpp: text("kpp"),
    ogrn: text("ogrn"),
    name: text("name").notNull(), // ООО «Чемпион», ИП Иванов И. И.
    legalAddress: text("legal_address").default("").notNull(),
    kind: text("kind").notNull(), // CLUB | SHOP | OTHER
    tables: integer("tables"), // сколько столов / точек
    city: text("city").default("").notNull(),
    website: text("website"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    comment: text("comment"),
    status: orgStatusEnum("status").default("PENDING").notNull(),
    rejectReason: text("reject_reason"),
    reviewedById: text("reviewed_by_id"),
    reviewedAt: ts("reviewed_at"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("organization_status_idx").on(t.status)],
);

/** Номера счетов Робокассы (InvId — только число) */
export const robokassaInvSeq = pgSequence("robokassa_inv_seq", { startWith: 100001 });

export const payment = pgTable("payment", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  provider: text("provider").default("yookassa").notNull(),
  externalId: text("external_id").notNull().unique(),
  status: paymentStatusEnum("status").default("PENDING").notNull(),
  amount: integer("amount").notNull(),
  confirmationUrl: text("confirmation_url"), // страница оплаты ЮKassa
  currency: text("currency"), // счёт Робокассы в валюте покупателя: USD, EUR, KZT; пусто — рубли
  currencyAmount: integer("currency_amount"), // сумма счёта в валюте, центы / тиыны
  refundedAmount: integer("refunded_amount").default(0).notNull(),
  raw: jsonb("raw"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const promoUsage = pgTable(
  "promo_usage",
  {
    id: id(),
    promoId: text("promo_id")
      .notNull()
      .references(() => promoCode.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("promo_usage_idx").on(t.promoId, t.userId)],
);

// ============================================================
// Бонусы
// ============================================================

export const bonusReasonEnum = pgEnum("bonus_reason", [
  "ORDER_ACCRUAL",
  "ORDER_SPEND",
  "REFERRAL",
  "BIRTHDAY",
  "WELCOME",
  "MANUAL",
  "EXPIRED",
  "REFUND",
  "REVIEW",
]);

export const bonusTransaction = pgTable(
  "bonus_transaction",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // + начисление, − списание
    reason: bonusReasonEnum("reason").notNull(),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
    posSaleId: text("pos_sale_id"), // покупка в клубе (касса)
    comment: text("comment"),
    expiresAt: ts("expires_at"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("bonus_user_idx").on(t.userId, t.createdAt)],
);

// ============================================================
// Адреса, избранное, отзывы, «сообщить о поступлении»
// ============================================================

/** «Мои адреса»: сохранённые карточки доставки (до 5). Получатель может быть другим человеком. */
export const address = pgTable(
  "address",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").default("Дом").notNull(),
    deliveryType: text("delivery_type").default("PVZ").notNull(), // PVZ | COURIER
    country: text("country").default("RU").notNull(),
    city: text("city").notNull(),
    cdekCityCode: integer("cdek_city_code"),
    address: text("address").notNull(), // адрес пункта СДЭК или адрес для курьера
    postalCode: text("postal_code"),
    cdekPvzCode: text("cdek_pvz_code"),
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    note: text("note"), // попадает в комментарий к заказу и курьеру СДЭК
    isDefault: boolean("is_default").default(false).notNull(),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("address_user_idx").on(t.userId)],
);

export const favorite = pgTable(
  "favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    // «Сообщить о снижении цены»: цена, от которой считаем снижение (при добавлении / последнем письме), копейки
    notifiedPrice: integer("notified_price"),
    notifiedAt: ts("notified_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const reviewStatusEnum = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED"]);

export const review = pgTable(
  "review",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }), // подтверждённая покупка
    rating: integer("rating").notNull(),
    text: text("text").notNull(),
    photos: text("photos").array().default([]).notNull(),
    status: reviewStatusEnum("status").default("PENDING").notNull(),
    adminReply: text("admin_reply"),
    moderatedAt: ts("moderated_at"),
    moderatedById: text("moderated_by_id"),
    bonusCredited: boolean("bonus_credited").default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("review_user_product_idx").on(t.productId, t.userId), index("review_status_idx").on(t.status)],
);

export const stockSubscription = pgTable(
  "stock_subscription",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    email: text("email"),
    createdAt: createdAt(),
    notifiedAt: ts("notified_at"),
  },
  (t) => [uniqueIndex("stock_sub_user_product_idx").on(t.productId, t.userId)],
);

// ============================================================
// Фото товаров. Хранятся в базе: на Timeweb файлы контейнера
// стираются при каждом обновлении сайта, а база — нет.
// ============================================================

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const media = pgTable("media", {
  id: id(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
});

// ============================================================
// Настройки сайта (меняются из админки) и журнал действий админов
// ============================================================

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

// ============================================================
// Проверка товара перед отправкой: фото и видео на Google Диске, серийник, пломба, чек-лист мастера
// ============================================================

export const orderInspection = pgTable("order_inspection", {
  orderId: text("order_id")
    .primaryKey()
    .references(() => order.id, { onDelete: "cascade" }),
  folderId: text("folder_id"), // папка заказа на Google Диске
  folderUrl: text("folder_url"),
  serialNumber: text("serial_number"),
  sealNumber: text("seal_number"),
  checklist: text("checklist").array().default([]).notNull(), // отмеченные пункты
  note: text("note"),
  checkedAt: ts("checked_at"), // «Проверено» — с этого момента покупатель видит проверку
  checkedById: text("checked_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const inspectionMedia = pgTable(
  "inspection_media",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    returnId: text("return_id"), // фото проверки по заявке на возврат; пусто — проверка перед отправкой
    driveFileId: text("drive_file_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size"),
    driveCreatedAt: ts("drive_created_at"), // дата загрузки по Google Диску
    webViewLink: text("web_view_link"),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("inspection_media_order_idx").on(t.orderId)],
);

// ============================================================
// Возвраты и обмены: заявка из личного кабинета, рассматриваем в течение 7 дней
// ============================================================

export const returnKindEnum = pgEnum("return_kind", ["QUALITY", "DEFECT"]); // не подошёл / брак, повреждение, пересорт
export const returnResolutionEnum = pgEnum("return_resolution", ["REFUND", "EXCHANGE", "DISCOUNT"]);
export const returnStatusEnum = pgEnum("return_status", ["NEW", "APPROVED", "RECEIVED", "COMPLETED", "REJECTED", "CANCELLED"]);

export const returnRequest = pgTable(
  "return_request",
  {
    id: id(),
    number: text("number").notNull().unique(), // RT-261015-7QX4
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: returnKindEnum("kind").notNull(),
    resolution: returnResolutionEnum("resolution").default("REFUND").notNull(), // чего хочет покупатель
    reason: text("reason").notNull(),
    comment: text("comment").default("").notNull(),
    photos: text("photos").array().default([]).notNull(),
    status: returnStatusEnum("status").default("NEW").notNull(),
    decisionDue: ts("decision_due").notNull(), // до какого числа ответить (7 дней)
    answer: text("answer"), // ответ магазина: инструкция по отправке или причина отказа
    refundAmount: integer("refund_amount"), // копейки, сколько вернули
    bonusReturned: integer("bonus_returned"), // бонусов вернули на счёт
    restocked: boolean("restocked").default(false).notNull(),
    handledById: text("handled_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
    resolvedAt: ts("resolved_at"),
    dueReminderAt: ts("due_reminder_at"),
    // Проверка мастером после получения товара: срок — 10 дней с получения
    receivedAt: ts("received_at"),
    inspectionDue: ts("inspection_due"),
    inspectionReminderAt: ts("inspection_reminder_at"),
    conclusion: text("conclusion"), // заключение мастера — видит покупатель
  },
  (t) => [index("return_request_status_idx").on(t.status), index("return_request_order_idx").on(t.orderId)],
);

export const returnItem = pgTable("return_item", {
  id: id(),
  requestId: text("request_id")
    .notNull()
    .references(() => returnRequest.id, { onDelete: "cascade" }),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItem.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
});

// ============================================================
// Корзина вошедшего покупателя на сервере: одна на всех устройствах и для напоминаний о брошенной корзине
// ============================================================

export const savedCart = pgTable(
  "saved_cart",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    items: jsonb("items").$type<{ variantId: string; qty: number }[]>().default([]).notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
    remindedAt: ts("reminded_at"), // когда напомнили о брошенной корзине
    remindCount: integer("remind_count").default(0).notNull(),
    recoveredAt: ts("recovered_at"), // оформил заказ после напоминания
    promoSentAt: ts("promo_sent_at"), // когда прислали персональный промокод за брошенную корзину
  },
  (t) => [index("saved_cart_updated_idx").on(t.updatedAt)],
);

// ============================================================
// Рассылки (промокоды и новости) — только тем, кто дал согласие на рекламу
// ============================================================

export const campaignStatusEnum = pgEnum("campaign_status", ["DRAFT", "SENDING", "DONE", "CANCELLED"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);

export const campaign = pgTable("campaign", {
  id: id(),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""), // обычный текст, переносы строк сохраняются
  promoCodeId: text("promo_code_id").references(() => promoCode.id, { onDelete: "set null" }),
  buttonText: text("button_text"),
  buttonUrl: text("button_url"),
  channelEmail: boolean("channel_email").default(true).notNull(),
  channelTelegram: boolean("channel_telegram").default(false).notNull(),
  channelPush: boolean("channel_push").default(false).notNull(), // уведомлением в приложение (push)
  onlyVerified: boolean("only_verified").default(false).notNull(),
  status: campaignStatusEnum("status").default("DRAFT").notNull(),
  total: integer("total").default(0).notNull(),
  sent: integer("sent").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  skipped: integer("skipped").default(0).notNull(),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
});

export const campaignRecipient = pgTable(
  "campaign_recipient",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // email | telegram | push
    address: text("address").notNull(), // почта или Telegram ID на момент запуска
    status: deliveryStatusEnum("status").default("PENDING").notNull(),
    error: text("error"),
    sentAt: ts("sent_at"),
  },
  (t) => [
    uniqueIndex("campaign_recipient_uniq").on(t.campaignId, t.userId, t.channel),
    index("campaign_recipient_status_idx").on(t.status, t.channel),
  ],
);

// ============================================================
// Подарочные сертификаты
// ============================================================

export const giftCardStatusEnum = pgEnum("gift_card_status", [
  "PENDING", // куплен на сайте, ждём оплату
  "ACTIVE",
  "VOID", // не оплачен, аннулирован или деньги возвращены
]);

export const giftCard = pgTable(
  "gift_card",
  {
    id: id(),
    code: text("code").notNull().unique(), // XXXX-XXXX-XXXX — вводят при оформлении
    token: text("token").notNull().unique(), // адрес страницы сертификата /gift/<token>
    status: giftCardStatusEnum("status").default("PENDING").notNull(),
    source: text("source").notNull(), // SITE — куплен на сайте, ADMIN — выпущен в админке, POS — продан в кассе клуба
    posSaleId: text("pos_sale_id"), // продан в кассе: чек продажи (оплата наличными или по QR)
    initialAmount: integer("initial_amount").notNull(), // копейки
    balance: integer("balance").notNull(), // копейки
    expiresAt: ts("expires_at"), // null — бессрочно (или ещё не оплачен)

    buyerId: text("buyer_id").references(() => user.id, { onDelete: "set null" }),
    buyerEmail: text("buyer_email"), // для чека
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email"), // после отправки письма маскируется
    senderName: text("sender_name"),
    message: text("message"),
    sendAt: ts("send_at"), // когда отправить письмо получателю; null — сразу после оплаты
    sentAt: ts("sent_at"),

    paymentId: text("payment_id").unique(), // платёж ЮKassa (аванс)
    paymentStatus: paymentStatusEnum("payment_status"),
    confirmationUrl: text("confirmation_url"),
    paidAt: ts("paid_at"),
    payExpiresAt: ts("pay_expires_at"),
    refundedAt: ts("refunded_at"),
    voidedAt: ts("voided_at"), // аннулирован в админке — поздняя оплата его уже не включит

    note: text("note"), // заметка админа
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("gift_card_buyer_idx").on(t.buyerId), index("gift_card_status_idx").on(t.status)],
);

/** Списания с сертификата. reversedAt — заказ отменён или возвращён, сумма вернулась на сертификат. */
export const giftCardUse = pgTable(
  "gift_card_use",
  {
    id: id(),
    giftCardId: text("gift_card_id")
      .notNull()
      .references(() => giftCard.id, { onDelete: "cascade" }),
    // Чем оплачено сертификатом: заказ на сайте или покупка в кассе клуба (одно из двух)
    orderId: text("order_id").references(() => order.id, { onDelete: "cascade" }),
    posSaleId: text("pos_sale_id").references(() => posSale.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reversedAt: ts("reversed_at"),
    // Чек зачёта аванса в ЮKassa (для сертификатов, купленных на сайте)
    receiptId: text("receipt_id"),
    receiptError: text("receipt_error"),
    createdAt: createdAt(),
  },
  (t) => [index("gift_card_use_card_idx").on(t.giftCardId), index("gift_card_use_order_idx").on(t.orderId), index("gift_card_use_pos_idx").on(t.posSaleId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // user.ban, page.publish, ...
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

// ============================================================
// Связи (для удобных запросов db.query.*)
// ============================================================

export const returnRequestRelations = relations(returnRequest, ({ one, many }) => ({
  order: one(order, { fields: [returnRequest.orderId], references: [order.id] }),
  user: one(user, { fields: [returnRequest.userId], references: [user.id] }),
  items: many(returnItem),
}));

export const returnItemRelations = relations(returnItem, ({ one }) => ({
  request: one(returnRequest, { fields: [returnItem.requestId], references: [returnRequest.id] }),
  orderItem: one(orderItem, { fields: [returnItem.orderItemId], references: [orderItem.id] }),
}));

export const campaignRelations = relations(campaign, ({ one, many }) => ({
  promo: one(promoCode, { fields: [campaign.promoCodeId], references: [promoCode.id] }),
  createdBy: one(user, { fields: [campaign.createdById], references: [user.id] }),
  recipients: many(campaignRecipient),
}));

export const campaignRecipientRelations = relations(campaignRecipient, ({ one }) => ({
  campaign: one(campaign, { fields: [campaignRecipient.campaignId], references: [campaign.id] }),
  user: one(user, { fields: [campaignRecipient.userId], references: [user.id] }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  consents: many(consent),
  orders: many(order),
  bonusTransactions: many(bonusTransaction),
}));

export const consentRelations = relations(consent, ({ one }) => ({
  user: one(user, { fields: [consent.userId], references: [user.id] }),
  document: one(consentDocument, { fields: [consent.documentId], references: [consentDocument.id] }),
}));

/** Клубы сети «Чемпион» и «Абрамов»: самовывоз заказов и приём киёв в мастерскую */
export const club = pgTable("club", {
  id: id(),
  name: text("name").notNull(), // «Бильярдный клуб «Чемпион»»
  city: text("city").notNull(),
  address: text("address").notNull(),
  workTime: text("work_time").default("").notNull(),
  phone: text("phone"),
  note: text("note").default("").notNull(), // как найти, где отдать заказ
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  pickup: boolean("pickup").default(true).notNull(), // выдаёт заказы
  ownStock: boolean("own_stock").default(false).notNull(), // свой остаток: касса клуба продаёт из него, а не со склада
  service: boolean("service").default(true).notNull(), // принимает кии в мастерскую
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
});

/** Мастерская: прайс услуг (замена наклейки, ремонт и т. п.) */
export const serviceItem = pgTable("service_item", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  price: integer("price").default(0).notNull(), // копейки
  priceFrom: boolean("price_from").default(false).notNull(), // «от …» — точную цену скажет мастер
  days: integer("days").default(1).notNull(), // срок, дней
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
});

export const serviceStatusEnum = pgEnum("service_status", ["NEW", "RECEIVED", "IN_WORK", "READY", "DONE", "CANCELLED"]);

/** Заявка в мастерскую */
export const serviceRequest = pgTable(
  "service_request",
  {
    id: id(),
    number: text("number").notNull().unique(), // RM-261022-7QX4
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    items: jsonb("items").$type<{ id: string; name: string; price: number; priceFrom: boolean; days: number }[]>().default([]).notNull(),
    description: text("description").default("").notNull(), // что случилось с кием
    photos: text("photos").array().default([]).notNull(),
    handover: text("handover").notNull(), // CLUB — принесёт в клуб, CDEK — пришлёт
    clubId: text("club_id"),
    returnMethod: text("return_method").notNull(), // CLUB — заберёт в клубе, CDEK — отправить
    returnAddress: text("return_address"), // для отправки СДЭК: город, пункт или адрес
    status: serviceStatusEnum("status").default("NEW").notNull(),
    price: integer("price"), // итоговая цена от мастера, копейки
    readyBy: ts("ready_by"), // к какому дню будет готов
    paymentId: text("payment_id"),
    paymentStatus: text("payment_status"), // PENDING | SUCCEEDED | CANCELED | OFFLINE | UNDERPAID (оплатили меньше цены)
    payUrl: text("pay_url"),
    oldPaymentIds: text("old_payment_ids").array().default([]).notNull(), // прежние счета: оплату по старой ссылке тоже засчитываем
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("service_request_status_idx").on(t.status), index("service_request_user_idx").on(t.userId)],
);

export const serviceEvent = pgTable(
  "service_event",
  {
    id: id(),
    requestId: text("request_id")
      .notNull()
      .references(() => serviceRequest.id, { onDelete: "cascade" }),
    status: serviceStatusEnum("status").notNull(),
    note: text("note"),
    photo: text("photo"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("service_event_request_idx").on(t.requestId)],
);

/** Галерея готовых киёв «Чемпион»: фото и сборка — кнопка «Собрать такой же» */
export const cueShowcase = pgTable("cue_showcase", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  photos: text("photos").array().default([]).notNull(),
  cueKey: text("cue_key"), // сборка без гравировки
  published: boolean("published").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Изготовление кия на заказ: этапы, которые видит покупатель (отправка — обычным статусом заказа) */
export const productionStageEnum = pgEnum("production_stage", ["ACCEPTED", "IN_WORK", "READY"]);

export const productionEvent = pgTable(
  "production_event",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    stage: productionStageEnum("stage").notNull(),
    note: text("note"), // комментарий мастера — его видит покупатель
    photo: text("photo"), // фото кия на этом этапе
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("production_event_order_idx").on(t.orderId)],
);

export const cuePassportStatusEnum = pgEnum("cue_passport_status", ["ACTIVE", "VOID"]);

/**
 * Электронный паспорт кия: QR на кие → страница с моделью, мастером, датой, гарантией и историей обслуживания.
 * code — в QR (длинный, не угадать), serial — гравируется на кие и печатается в паспорте, claimCode — на бумажной
 * карточке: им покупатель привязывает кий к себе. Владелец публично не показывается.
 */
export const cuePassport = pgTable(
  "cue_passport",
  {
    id: id(),
    code: text("code").notNull().unique(),
    serial: text("serial").notNull().unique(), // AB-26-0001
    claimCode: text("claim_code").notNull(),
    model: text("model").notNull(),
    spec: text("spec"), // параметры по строке «Группа: значение»
    master: text("master"), // мастер, собравший кий
    madeAt: ts("made_at").notNull(),
    warrantyMonths: integer("warranty_months").default(12).notNull(),
    photo: text("photo"),
    status: cuePassportStatusEnum("status").default("ACTIVE").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
    orderItemId: text("order_item_id"),
    transferToken: text("transfer_token"), // передача новому владельцу: ссылка живёт 7 дней
    transferUntil: ts("transfer_until"),
    scans: integer("scans").default(0).notNull(), // сколько раз открывали паспорт
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("cue_passport_owner_idx").on(t.ownerId), index("cue_passport_order_idx").on(t.orderId)],
);

/** История кия: изготовлен, продан, сменил владельца, обслуживание в мастерской, заметки — без имён */
export const cuePassportEvent = pgTable(
  "cue_passport_event",
  {
    id: id(),
    passportId: text("passport_id")
      .notNull()
      .references(() => cuePassport.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // MADE | SOLD | OWNER | SERVICE | NOTE
    text: text("text").notNull(),
    serviceRequestId: text("service_request_id").references(() => serviceRequest.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("cue_passport_event_passport_idx").on(t.passportId)],
);

export const productionEventRelations = relations(productionEvent, ({ one }) => ({
  order: one(order, { fields: [productionEvent.orderId], references: [order.id] }),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  promo: one(promoCode, { fields: [order.promoCodeId], references: [promoCode.id] }),
  items: many(orderItem),
  payments: many(payment),
  returns: many(returnRequest),
  inspection: one(orderInspection),
  media: many(inspectionMedia),
  giftUses: many(giftCardUse),
  production: many(productionEvent),
}));

export const giftCardRelations = relations(giftCard, ({ one, many }) => ({
  buyer: one(user, { fields: [giftCard.buyerId], references: [user.id] }),
  uses: many(giftCardUse),
}));

export const giftCardUseRelations = relations(giftCardUse, ({ one }) => ({
  giftCard: one(giftCard, { fields: [giftCardUse.giftCardId], references: [giftCard.id] }),
  order: one(order, { fields: [giftCardUse.orderId], references: [order.id] }),
  posSale: one(posSale, { fields: [giftCardUse.posSaleId], references: [posSale.id] }),
}));


export const orderInspectionRelations = relations(orderInspection, ({ one }) => ({
  order: one(order, { fields: [orderInspection.orderId], references: [order.id] }),
}));

export const inspectionMediaRelations = relations(inspectionMedia, ({ one }) => ({
  order: one(order, { fields: [inspectionMedia.orderId], references: [order.id] }),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  product: one(product, { fields: [orderItem.productId], references: [product.id] }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  order: one(order, { fields: [payment.orderId], references: [order.id] }),
}));

export const promoCodeRelations = relations(promoCode, ({ many }) => ({
  usages: many(promoUsage),
}));

export const promoUsageRelations = relations(promoUsage, ({ one }) => ({
  promo: one(promoCode, { fields: [promoUsage.promoId], references: [promoCode.id] }),
  order: one(order, { fields: [promoUsage.orderId], references: [order.id] }),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  category: one(category, { fields: [product.categoryId], references: [category.id] }),
  images: many(productImage),
  variants: many(productVariant),
}));

export const productImageRelations = relations(productImage, ({ one }) => ({
  product: one(product, { fields: [productImage.productId], references: [product.id] }),
}));

export const productVariantRelations = relations(productVariant, ({ one }) => ({
  product: one(product, { fields: [productVariant.productId], references: [product.id] }),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  user: one(user, { fields: [review.userId], references: [user.id] }),
  product: one(product, { fields: [review.productId], references: [product.id] }),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  product: one(product, { fields: [favorite.productId], references: [product.id] }),
}));

export const stockSubscriptionRelations = relations(stockSubscription, ({ one }) => ({
  user: one(user, { fields: [stockSubscription.userId], references: [user.id] }),
  product: one(product, { fields: [stockSubscription.productId], references: [product.id] }),
}));

export const bonusTransactionRelations = relations(bonusTransaction, ({ one }) => ({
  user: one(user, { fields: [bonusTransaction.userId], references: [user.id] }),
}));

/** Заявка «Клуб под ключ»: план зала, расстановка столов, смета */
export const turnkeyRequest = pgTable(
  "turnkey_request",
  {
    id: id(),
    number: text("number").notNull().unique(), // KL-261024-7QX4
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    city: text("city").default("").notNull(),
    comment: text("comment"),
    plan: jsonb("plan").notNull(), // контур зала, колонны, зоны
    tables: jsonb("tables").notNull(), // расстановка
    models: jsonb("models").notNull(), // модели и цены на момент заявки
    estimate: jsonb("estimate").notNull(), // строки сметы
    area: integer("area").notNull(), // м² × 100
    tableCount: integer("table_count").notNull(),
    tableGap: integer("table_gap").default(1800).notNull(), // расстояние между столами, которое выбрал клиент, мм
    budget: bigint("budget", { mode: "number" }), // бюджет клиента, ₽
    total: bigint("total", { mode: "number" }).notNull(), // копейки
    status: text("status").default("NEW").notNull(), // NEW | IN_WORK | OFFER | WON | LOST
    adminNote: text("admin_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("turnkey_request_status_idx").on(t.status)],
);

/** Журнал: статьи и советы */
export const article = pgTable(
  "article",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").default("").notNull(), // анонс в списке и в поиске
    body: text("body").default("").notNull(), // простая разметка: ## заголовок, - список, ![](фото), [[product:slug]]
    cover: text("cover"),
    section: text("section").default("tips").notNull(), // choose | care | game | club | news | tips
    productIds: text("product_ids").array().default([]).notNull(), // «Товары из статьи»
    visibility: visibilityEnum("visibility").default("DRAFT").notNull(),
    publishAt: ts("publish_at"),
    previewToken: previewToken(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("article_section_idx").on(t.section)],
);

/** Рекламные баннеры: слайдер вверху главной и тонкая полоса над шапкой на всех страницах */
export const bannerPlaceEnum = pgEnum("banner_place", ["HOME", "STRIP"]);
export const banner = pgTable(
  "banner",
  {
    id: id(),
    place: bannerPlaceEnum("place").default("HOME").notNull(),
    label: text("label").default("").notNull(), // маленькая надпись над заголовком: «Акция», «Новинка»
    title: text("title").default("").notNull(),
    text: text("text").default("").notNull(),
    image: text("image"), // компьютер, 2400×800
    imageMobile: text("image_mobile"), // телефон, 1080×1080
    buttonText: text("button_text").default("").notNull(),
    url: text("url").default("").notNull(),
    tone: text("tone").default("dark").notNull(), // полоса: gold | dark | red; слайд: dark (светлый текст) | light (тёмный текст)
    countdown: boolean("countdown").default(false).notNull(), // показывать «до конца акции» по endsAt
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("banner_place_idx").on(t.place, t.sortOrder)],
);

/** Уведомления на телефон (Web Push): подписки браузеров. Только для вошедших: покупателей, сотрудников и клубов */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(), // адрес службы уведомлений браузера (Google, Apple, Mozilla, Microsoft)
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    device: text("device").default("").notNull(), // «Android · Chrome» — чтобы человек узнал своё устройство
    failures: integer("failures").default(0).notNull(),
    lastSentAt: ts("last_sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)],
);

/** Вопросы о товаре: покупатель спрашивает, магазин отвечает, ответ виден всем */
export const questionStatusEnum = pgEnum("question_status", ["NEW", "PUBLISHED", "HIDDEN"]);
export const productQuestion = pgTable(
  "product_question",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    answer: text("answer"),
    answeredById: text("answered_by_id"),
    answeredAt: ts("answered_at"),
    status: questionStatusEnum("status").default("NEW").notNull(), // NEW — ждёт ответа, PUBLISHED — на сайте, HIDDEN — скрыт
    createdAt: createdAt(),
  },
  (t) => [index("product_question_product_idx").on(t.productId, t.status), index("product_question_status_idx").on(t.status, t.createdAt)],
);

export const productQuestionRelations = relations(productQuestion, ({ one }) => ({
  user: one(user, { fields: [productQuestion.userId], references: [user.id] }),
  product: one(product, { fields: [productQuestion.productId], references: [product.id] }),
}));

/** Тренеры: профиль на сайте. Доступ (роль COACH) даёт владелец в карточке клиента */
export const coachProfile = pgTable("coach_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  photo: text("photo"),
  title: text("title").default("").notNull(), // «Мастер спорта, тренер по русскому бильярду»
  about: text("about").default("").notNull(),
  games: text("games").default("Русский бильярд").notNull(),
  clubIds: text("club_ids").array().default([]).notNull(),
  // Запись по свободному времени
  pricePerHour: integer("price_per_hour").default(300000).notNull(), // копейки за 60 минут индивидуально
  durations: integer("durations").array().default([60, 90, 120]).notNull(), // какие длительности можно выбрать
  stepMin: integer("step_min").default(30).notNull(), // шаг начала: каждые 30 минут
  leadHours: integer("lead_hours").default(2).notNull(), // не раньше чем через N часов
  horizonDays: integer("horizon_days").default(14).notNull(), // на сколько дней вперёд открыта запись
  autoConfirm: boolean("auto_confirm").default(false).notNull(), // заявки подтверждаются сами
  trial: text("trial").default("OFF").notNull(), // пробное занятие: OFF — нет, FREE — бесплатно, HALF — скидка 50%
  trialDurationMin: integer("trial_duration_min").default(60).notNull(),
  isPublished: boolean("is_published").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const trainingSlotStatusEnum = pgEnum("training_slot_status", ["OPEN", "CANCELLED"]);
// REQUESTED — заявка ждёт тренера, BOOKED — подтверждена, DECLINED — тренер отказал
export const trainingBookingStatusEnum = pgEnum("training_booking_status", ["BOOKED", "CANCELLED", "ATTENDED", "NO_SHOW", "REQUESTED", "DECLINED"]);

/** Тренировка в расписании: индивидуальная (1 место) или групповая */
export const trainingSlot = pgTable(
  "training_slot",
  {
    id: id(),
    coachId: text("coach_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    durationMin: integer("duration_min").default(60).notNull(),
    kind: text("kind").default("INDIVIDUAL").notNull(), // INDIVIDUAL | GROUP
    title: text("title").notNull(),
    capacity: integer("capacity").default(1).notNull(),
    price: integer("price").default(0).notNull(), // копейки, оплата в клубе
    note: text("note").default("").notNull(),
    status: trainingSlotStatusEnum("status").default("OPEN").notNull(),
    cancelReason: text("cancel_reason"),
    source: text("source").default("PUBLISHED").notNull(), // PUBLISHED — групповая в расписании, REQUEST — заявка клиента, MANUAL — тренер внёс сам
    diary: text("diary").default("").notNull(), // дневник: что делали на тренировке
    isTrial: boolean("is_trial").default(false).notNull(), // пробное занятие (бесплатно или −50%)
    createdAt: createdAt(),
  },
  (t) => [index("training_slot_start_idx").on(t.startsAt), index("training_slot_coach_idx").on(t.coachId, t.startsAt)],
);

export const trainingBooking = pgTable(
  "training_booking",
  {
    id: id(),
    slotId: text("slot_id")
      .notNull()
      .references(() => trainingSlot.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // пусто — клиент не с сайта (тренер внёс сам)
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    status: trainingBookingStatusEnum("status").default("BOOKED").notNull(),
    declineReason: text("decline_reason"),
    comment: text("comment").default("").notNull(), // пожелание к тренировке
    cancelledBy: text("cancelled_by"), // USER | COACH
    remindedAt: ts("reminded_at"),
    createdAt: createdAt(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [
    index("training_booking_slot_idx").on(t.slotId),
    index("training_booking_user_idx").on(t.userId),
    uniqueIndex("training_booking_active_uq").on(t.slotId, t.userId).where(sql`${t.status} <> 'CANCELLED'`),
  ],
);

export const coachProfileRelations = relations(coachProfile, ({ one }) => ({
  user: one(user, { fields: [coachProfile.userId], references: [user.id] }),
}));
export const trainingSlotRelations = relations(trainingSlot, ({ one, many }) => ({
  coach: one(user, { fields: [trainingSlot.coachId], references: [user.id] }),
  club: one(club, { fields: [trainingSlot.clubId], references: [club.id] }),
  bookings: many(trainingBooking),
}));
export const trainingBookingRelations = relations(trainingBooking, ({ one }) => ({
  slot: one(trainingSlot, { fields: [trainingBooking.slotId], references: [trainingSlot.id] }),
  user: one(user, { fields: [trainingBooking.userId], references: [user.id] }),
}));

/** Рабочее время тренера по дням недели (1 — понедельник … 7 — воскресенье), в минутах от полуночи по Москве */
export const coachHours = pgTable(
  "coach_hours",
  {
    id: id(),
    coachId: text("coach_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("coach_hours_coach_idx").on(t.coachId, t.weekday)],
);

/** Выходные и отпуск тренера */
export const coachDayOff = pgTable(
  "coach_day_off",
  {
    id: id(),
    coachId: text("coach_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    note: text("note").default("").notNull(),
  },
  (t) => [uniqueIndex("coach_day_off_uq").on(t.coachId, t.day)],
);

/**
 * Соглашение тренера о конфиденциальности данных клиентов. Тренер заполняет реквизиты
 * и подписывает в кабинете простой электронной подписью — кодом из письма на свою почту.
 * Строки не удаляются: новая редакция — новая подпись.
 */
export const coachAgreement = pgTable(
  "coach_agreement",
  {
    id: id(),
    coachId: text("coach_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    fullName: text("full_name").notNull(),
    taxStatus: text("tax_status").notNull(), // SELF — самозанятый, IP — ИП, PERSON — физлицо
    inn: text("inn"),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    body: text("body").notNull(), // текст ровно в том виде, как его подписали
    sha256: text("sha256").notNull(),
    codeHash: text("code_hash"),
    codeExpiresAt: ts("code_expires_at"),
    codeAttempts: integer("code_attempts").default(0).notNull(),
    signedAt: ts("signed_at"),
    signIp: text("sign_ip"),
    signUserAgent: text("sign_user_agent"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("coach_agreement_coach_idx").on(t.coachId)],
);

// ============================================================
// Учёт: склад, касса (продажи вживую), расходы
// ============================================================

/**
 * Движения склада, сделанные вручную или кассой: приход, списание, инвентаризация, продажа в кассе.
 * Продажи на сайте сюда не пишутся — они видны в заказах.
 */
export const stockMove = pgTable(
  "stock_move",
  {
    id: id(),
    variantId: text("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    name: text("name").notNull(), // название товара на момент движения
    // RECEIPT — приход, WRITE_OFF — списание, INVENTORY — инвентаризация, POS — продажа в кассе, POS_CANCEL — отмена продажи
    type: text("type").notNull(),
    qty: integer("qty").notNull(), // со знаком: + пришло, − ушло
    unitCost: integer("unit_cost"), // копейки за 1 шт.
    stockAfter: integer("stock_after"),
    note: text("note"),
    posSaleId: text("pos_sale_id"),
    clubId: text("club_id"), // где: клуб; пусто — центральный склад
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("stock_move_variant_idx").on(t.variantId), index("stock_move_created_idx").on(t.createdAt)],
);

/** Остаток товара в клубе (если у клуба включён свой учёт). Центральный склад — product_variant.stock */
export const clubStock = pgTable(
  "club_stock",
  {
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariant.id, { onDelete: "cascade" }),
    qty: integer("qty").default(0).notNull(),
    minQty: integer("min_qty"), // норма: сколько держать в клубе; напомним, когда останется половина. Пусто — напомним, когда закончится
    lowNotifiedAt: ts("low_notified_at"), // уже предупредили, что заканчивается
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.variantId] }), index("club_stock_variant_idx").on(t.variantId)],
);

/** Продажа в кассе (в клубе, на турнире). Покупатель не записывается — только товары и деньги. */
export const posSale = pgTable(
  "pos_sale",
  {
    id: id(),
    number: text("number").notNull().unique(), // K-261106-7QX4
    status: text("status").default("PENDING").notNull(), // PENDING — ждём оплату по QR, PAID, CANCELLED
    method: text("method").notNull(), // CASH — наличные, SBP — QR СБП (ЮKassa), CARD — карта по QR-ссылке (ЮKassa), GIFT — целиком сертификатом
    kind: text("kind").default("SALE").notNull(), // SALE — товары, GIFT — продажа подарочного сертификата
    giftCardAmount: integer("gift_card_amount").default(0).notNull(), // оплачено сертификатом, копейки (не входит в total)
    subtotal: integer("subtotal").notNull(), // по ценам товаров, копейки
    discount: integer("discount").default(0).notNull(),
    total: integer("total").notNull(),
    cost: integer("cost").default(0).notNull(), // себестоимость товаров, копейки
    fee: integer("fee").default(0).notNull(), // комиссия платёжной системы, копейки
    paymentId: text("payment_id"), // ЮKassa
    qrUrl: text("qr_url"),
    place: text("place"), // где продали: клуб, турнир
    sellerId: text("seller_id").references(() => user.id, { onDelete: "set null" }),
    shiftId: text("shift_id"), // смена кассира
    clubId: text("club_id"), // в каком клубе продали
    stockClubId: text("stock_club_id"), // откуда списан товар: клуб со своим остатком; пусто — склад
    customerId: text("customer_id").references(() => user.id, { onDelete: "set null" }), // покупатель с бонусной картой (по телефону)
    bonusSpent: integer("bonus_spent").default(0).notNull(), // оплачено бонусами, копейки (не входит в total)
    bonusAccrued: integer("bonus_accrued").default(0).notNull(), // начислено бонусов, копейки
    bonusCredited: boolean("bonus_credited").default(false).notNull(),
    refunded: integer("refunded").default(0).notNull(), // возвращено деньгами по возвратам, копейки
    discountById: text("discount_by_id"), // скидку сверх лимита кассира разрешил менеджер (по PIN)
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("pos_sale_status_idx").on(t.status), index("pos_sale_paid_idx").on(t.paidAt), index("pos_sale_shift_idx").on(t.shiftId)],
);

/**
 * Смена кассы: открыли с разменом, продавали, закрыли — пересчитали наличные.
 * Должно быть = размен + наличные продажи смены; разница — недостача (−) или излишек (+).
 */
export const posShift = pgTable(
  "pos_shift",
  {
    id: id(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    place: text("place"),
    staffName: text("staff_name"), // кто на смене — для общего телефона кассы
    clubId: text("club_id"), // клуб смены (пусто — турнир или другое место)
    status: text("status").default("OPEN").notNull(), // OPEN | CLOSED
    openingCash: integer("opening_cash").default(0).notNull(), // размен на начало, копейки
    cashSales: integer("cash_sales"), // наличные продажи смены — на момент закрытия
    otherSales: integer("other_sales"), // СБП и карта — на момент закрытия
    expectedCash: integer("expected_cash"), // должно быть в кассе
    countedCash: integer("counted_cash"), // пересчитали
    cashMoves: integer("cash_moves"), // выемки (−) и внесения (+) за смену — на момент закрытия
    cashRefunds: integer("cash_refunds"), // возвраты наличными из кассы смены — на момент закрытия
    remindedAt: ts("reminded_at"), // напомнили, что смена не закрыта
    note: text("note"),
    openedAt: createdAt(),
    closedAt: ts("closed_at"),
    closedById: text("closed_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("pos_shift_seller_idx").on(t.sellerId), uniqueIndex("pos_shift_one_open").on(t.sellerId).where(sql`status = 'OPEN'`)],
);

export const posSaleItem = pgTable("pos_sale_item", {
  id: id(),
  saleId: text("sale_id")
    .notNull()
    .references(() => posSale.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
  variantId: text("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  price: integer("price").notNull(), // копейки за 1 шт. (после скидки строки)
  quantity: integer("quantity").notNull(),
  unitCost: integer("unit_cost"),
  returnedQty: integer("returned_qty").default(0).notNull(), // сколько вернули
});

/** Возврат в кассе: товар — на остаток, деньги — наличными из смены или через ЮKassa */
export const posReturn = pgTable(
  "pos_return",
  {
    id: id(),
    number: text("number").notNull().unique(), // V-261107-7QX4
    saleId: text("sale_id")
      .notNull()
      .references(() => posSale.id, { onDelete: "cascade" }),
    shiftId: text("shift_id"), // смена, из кассы которой отдали наличные
    sellerId: text("seller_id").references(() => user.id, { onDelete: "set null" }),
    approverId: text("approver_id").references(() => user.id, { onDelete: "set null" }), // менеджер, подтвердивший PIN
    method: text("method").notNull(), // CASH — наличными из кассы, YOOKASSA — на карту/счёт, NONE — оплачено бонусами
    amount: integer("amount").notNull(), // вернули деньгами, копейки
    cost: integer("cost").default(0).notNull(), // себестоимость вернувшегося товара
    bonusBack: integer("bonus_back").default(0).notNull(), // вернули на бонусный счёт (копейки)
    giftBack: integer("gift_back").default(0).notNull(), // вернули на подарочный сертификат (копейки)
    accruedBack: integer("accrued_back").default(0).notNull(), // списали начисленных за покупку (копейки)
    refundId: text("refund_id"), // ЮKassa
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("pos_return_sale_idx").on(t.saleId), index("pos_return_created_idx").on(t.createdAt)],
);

export const posReturnItem = pgTable("pos_return_item", {
  id: id(),
  returnId: text("return_id")
    .notNull()
    .references(() => posReturn.id, { onDelete: "cascade" }),
  saleItemId: text("sale_item_id").references(() => posSaleItem.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  amount: integer("amount").notNull(), // вернули за позицию деньгами, копейки
});

/**
 * Запрос подтверждения менеджера из кассы: скидка сверх лимита кассира или возврат.
 * Менеджеру уходит письмо со ссылкой; он открывает её у себя, вводит PIN и подтверждает или отклоняет.
 * Касса ждёт и проводит операцию только с тем же содержимым, что подтвердили (payloadHash).
 */
export const posApproval = pgTable(
  "pos_approval",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(), // ссылка из письма — в базе только хеш
    kind: text("kind").notNull(), // DISCOUNT | RETURN
    sellerId: text("seller_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    approverId: text("approver_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    summary: text("summary").notNull(), // что подтверждают — текстом для письма и страницы
    details: jsonb("details").$type<{ lines: { name: string; qty: number; amount: number }[]; total: number; discount?: number; percent?: number; kassa: string; staffName?: string | null; place?: string | null }>().notNull(),
    status: text("status").default("PENDING").notNull(), // PENDING | APPROVED | DENIED | CANCELLED | USED
    attempts: integer("attempts").default(0).notNull(), // неверных PIN по этой ссылке
    expiresAt: ts("expires_at").notNull(),
    decidedAt: ts("decided_at"),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("pos_approval_seller_idx").on(t.sellerId)],
);

// ============================================================
// Ревизия в клубе: сотрудник сканирует товар, менеджер сверяет с учётом и проводит расхождения
// ============================================================
export const stockCount = pgTable(
  "stock_count",
  {
    id: id(),
    clubId: text("club_id")
      .notNull()
      .references(() => club.id, { onDelete: "cascade" }),
    status: text("status").default("DRAFT").notNull(), // DRAFT — считают, SUBMITTED — ждёт менеджера, APPLIED — проведено, CANCELLED
    counts: jsonb("counts").$type<Record<string, number>>().default({}).notNull(), // variantId → насчитали штук
    full: boolean("full").default(true).notNull(), // полный пересчёт: что не отсканировали — нет в клубе
    staffName: text("staff_name"), // кто считал (общий телефон кассы)
    note: text("note"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    submittedAt: ts("submitted_at"),
    appliedAt: ts("applied_at"),
    appliedById: text("applied_by_id").references(() => user.id, { onDelete: "set null" }),
    result: jsonb("result").$type<{ lines: number; plus: number; minus: number; minusCost: number }>(), // итог проведения: позиций, излишки и недостача, шт; недостача по себестоимости, копейки
    createdAt: createdAt(),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("stock_count_club_idx").on(t.clubId), index("stock_count_status_idx").on(t.status)],
);

/** Выемка (−) и внесение (+) наличных в кассе во время смены */
export const posCashMove = pgTable(
  "pos_cash_move",
  {
    id: id(),
    shiftId: text("shift_id")
      .notNull()
      .references(() => posShift.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    staffName: text("staff_name"),
    createdAt: createdAt(),
  },
  (t) => [index("pos_cash_move_shift_idx").on(t.shiftId)],
);

export const posSaleRelations = relations(posSale, ({ many }) => ({ items: many(posSaleItem), returns: many(posReturn) }));
export const posReturnRelations = relations(posReturn, ({ one, many }) => ({
  sale: one(posSale, { fields: [posReturn.saleId], references: [posSale.id] }),
  items: many(posReturnItem),
}));
export const posReturnItemRelations = relations(posReturnItem, ({ one }) => ({ ret: one(posReturn, { fields: [posReturnItem.returnId], references: [posReturn.id] }) }));
export const posSaleItemRelations = relations(posSaleItem, ({ one }) => ({ sale: one(posSale, { fields: [posSaleItem.saleId], references: [posSale.id] }) }));

/** Расходы для чистой прибыли: реклама, аренда, зарплата, налоги… */
export const expense = pgTable(
  "expense",
  {
    id: id(),
    day: date("day").notNull(), // дата расхода (по Москве)
    category: text("category").notNull(),
    amount: integer("amount").notNull(), // копейки
    note: text("note"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("expense_day_idx").on(t.day)],
);

/** Заказ поставщику: составили по «Что докупить», отправили, приняли — товар пришёл на склад */
export const supplierOrder = pgTable(
  "supplier_order",
  {
    id: id(),
    number: text("number").notNull().unique(), // З-261106-01 → Z-261106-AB12
    supplier: text("supplier").notNull(),
    status: text("status").default("DRAFT").notNull(), // DRAFT — черновик, ORDERED — заказали, RECEIVED — пришло, CANCELLED
    note: text("note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    orderedAt: ts("ordered_at"),
    receivedAt: ts("received_at"),
  },
  (t) => [index("supplier_order_status_idx").on(t.status)],
);

export const supplierOrderItem = pgTable("supplier_order_item", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => supplierOrder.id, { onDelete: "cascade" }),
  variantId: text("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sku: text("sku"),
  qty: integer("qty").notNull(),
  unitCost: integer("unit_cost"), // ожидаемая закупочная цена, копейки
  receivedQty: integer("received_qty"),
});

export const supplierOrderRelations = relations(supplierOrder, ({ many }) => ({ items: many(supplierOrderItem) }));
export const supplierOrderItemRelations = relations(supplierOrderItem, ({ one }) => ({ order: one(supplierOrder, { fields: [supplierOrderItem.orderId], references: [supplierOrder.id] }) }));

/** Заявка «Стать тренером»: человек с аккаунтом рассказывает о себе, владелец одобряет — получает роль тренера */
export const coachApplication = pgTable(
  "coach_application",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").default("NEW").notNull(), // NEW — ждёт решения, APPROVED, REJECTED
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    city: text("city"),
    rank: text("rank"), // спортивное звание: МС, КМС…
    games: text("games").array().default(sql`'{}'::text[]`).notNull(),
    coachYears: integer("coach_years"),
    achievements: text("achievements"),
    about: text("about"),
    clubIds: text("club_ids").array().default(sql`'{}'::text[]`).notNull(), // в каких наших клубах хочет тренировать
    pricePerHour: integer("price_per_hour"), // желаемая цена индивидуального часа, копейки
    links: text("links"),
    clubsOnlyAccepted: boolean("clubs_only_accepted").default(false).notNull(), // согласен: тренировки только в наших клубах
    reply: text("reply"), // причина отказа или комментарий владельца
    reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("coach_application_status_idx").on(t.status), index("coach_application_user_idx").on(t.userId)],
);
