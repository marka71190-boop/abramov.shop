/**
 * Abramov Shop — схема базы данных (PostgreSQL, Drizzle ORM).
 *
 * Все суммы денег — в КОПЕЙКАХ (целые числа), чтобы не было ошибок округления.
 * Бонусы — в бонусах (1 бонус = 1 ₽).
 *
 * После изменения этого файла: npm run db:generate (создаст SQL-миграцию в /drizzle),
 * затем npm run db:migrate.
 */
import { relations } from "drizzle-orm";
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
export const roleEnum = pgEnum("role", ["CUSTOMER", "MANAGER", "OWNER", "CLUB"]);
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
    birthday: date("birthday"),
    birthdaySetAt: ts("birthday_set_at"), // когда указал — подарок только если указал заранее
    birthdayBonusYear: integer("birthday_bonus_year"), // год, за который подарок уже выдан
    bonusReminderAt: ts("bonus_reminder_at"), // последнее напоминание о сгорающих бонусах
    role: roleEnum("role").default("CUSTOMER").notNull(),
    clubId: text("club_id"), // для роли CLUB: в каком клубе работает
    organizationId: text("organization_id"), // сотрудник организации-оптовика

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

// ============================================================
// Журнал согласий (152-ФЗ). Записи никогда не удаляются:
// отзыв согласия — отметка revokedAt, а не удаление строки.
// ============================================================

export const consentKindEnum = pgEnum("consent_kind", [
  "PERSONAL_DATA", // обработка персональных данных
  "MARKETING", // рекламные рассылки
]);

export const consentSourceEnum = pgEnum("consent_source", [
  "REGISTRATION", // форма регистрации по почте
  "GOOGLE", // кнопка «Продолжить с Google»
  "VK", // кнопка «Продолжить с VK ID»
  "CHECKOUT", // оформление заказа
  "ACCOUNT", // включил в личном кабинете
  "RECONSENT", // повторное согласие (новая редакция документа или старый аккаунт)
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
  visibility: visibilityEnum("visibility").default("DRAFT").notNull(),
  publishAt: ts("publish_at"),
  previewToken: previewToken(),
  isLimited: boolean("is_limited").default(false).notNull(),
  limitedTotal: integer("limited_total"),
  // Габариты для расчёта доставки СДЭК
  weightGrams: integer("weight_grams").default(300).notNull(),
  lengthCm: integer("length_cm").default(10).notNull(),
  widthCm: integer("width_cm").default(10).notNull(),
  heightCm: integer("height_cm").default(10).notNull(),
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
  price: integer("price"), // если отличается от цены товара, копейки
  stock: integer("stock").default(0).notNull(),
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

/** Комплект со скидкой: если в корзине все товары комплекта — скидка на них */
export const bundle = pgTable("bundle", {
  id: id(),
  name: text("name").notNull(), // «Стартовый набор: кий + чехол + мел»
  note: text("note").default("").notNull(),
  productIds: text("product_ids").array().default([]).notNull(), // 2–6 товаров, по одному каждого
  percent: integer("percent").notNull(), // скидка на товары комплекта, %
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

    // Оплата: ONLINE — ЮKassa, INVOICE — по счёту для организации
    paymentMethod: text("payment_method").default("ONLINE").notNull(),
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
    channel: text("channel").notNull(), // email | telegram
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
    source: text("source").notNull(), // SITE — куплен на сайте, ADMIN — выпущен в админке
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
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reversedAt: ts("reversed_at"),
    // Чек зачёта аванса в ЮKassa (для сертификатов, купленных на сайте)
    receiptId: text("receipt_id"),
    receiptError: text("receipt_error"),
    createdAt: createdAt(),
  },
  (t) => [index("gift_card_use_card_idx").on(t.giftCardId), index("gift_card_use_order_idx").on(t.orderId)],
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
    paymentStatus: text("payment_status"), // PENDING | SUCCEEDED | CANCELED | OFFLINE
    payUrl: text("pay_url"),
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
