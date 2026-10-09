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
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
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

export const roleEnum = pgEnum("role", ["CUSTOMER", "MANAGER", "OWNER"]);
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
    role: roleEnum("role").default("CUSTOMER").notNull(),

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
});

export const productImage = pgTable("product_image", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
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
    discount: integer("discount").default(0).notNull(),
    bonusSpent: integer("bonus_spent").default(0).notNull(),
    shippingCost: integer("shipping_cost").default(0).notNull(),
    total: integer("total").notNull(),
    bonusAccrued: integer("bonus_accrued").default(0).notNull(),

    promoCodeId: text("promo_code_id").references(() => promoCode.id, { onDelete: "set null" }),

    // Доставка
    deliveryType: text("delivery_type"), // PVZ | COURIER
    city: text("city"),
    postalCode: text("postal_code"),
    address: text("address"),
    cdekPvzCode: text("cdek_pvz_code"),
    cdekOrderUuid: text("cdek_order_uuid"),
    trackNumber: text("track_number"),

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
});

export const payment = pgTable("payment", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  provider: text("provider").default("yookassa").notNull(),
  externalId: text("external_id").notNull().unique(),
  status: paymentStatusEnum("status").default("PENDING").notNull(),
  amount: integer("amount").notNull(),
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

export const address = pgTable("address", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label").default("Дом").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  postalCode: text("postal_code"),
  cdekPvzCode: text("cdek_pvz_code"),
  isDefault: boolean("is_default").default(false).notNull(),
});

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
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const reviewStatusEnum = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED"]);

export const review = pgTable("review", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  photos: text("photos").array().default([]).notNull(),
  status: reviewStatusEnum("status").default("PENDING").notNull(),
  createdAt: createdAt(),
});

export const stockSubscription = pgTable("stock_subscription", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  email: text("email"),
  createdAt: createdAt(),
  notifiedAt: ts("notified_at"),
});

// ============================================================
// Настройки сайта (меняются из админки) и журнал действий админов
// ============================================================

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

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

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  items: many(orderItem),
  payments: many(payment),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
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

export const bonusTransactionRelations = relations(bonusTransaction, ({ one }) => ({
  user: one(user, { fields: [bonusTransaction.userId], references: [user.id] }),
}));
