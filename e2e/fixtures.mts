/**
 * Тестовые данные для автотестов (чистая база после миграций и seed):
 * владелец с паролем и PIN, клуб со своим учётом, телефон кассы, два товара с остатками.
 * Запуск: npx tsx --conditions=react-server --tsconfig tsconfig.json e2e/fixtures.mts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema as s } from "@/db";
import { createDevice } from "@/lib/kassa-devices";
import { ensureShopBarcodes } from "@/lib/shop-barcodes";
import { E2E } from "./data.mjs";

const owner = await db.query.user.findFirst({ where: eq(s.user.email, E2E.owner.email) });
if (!owner) {
  const id = randomUUID();
  await db.insert(s.user).values({ id, name: "Владелец E2E", email: E2E.owner.email, emailVerified: true, role: "OWNER", pinHash: await hashPassword(E2E.owner.pin), pinSetAt: new Date() });
  await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(E2E.owner.password) });
}

const player = await db.query.user.findFirst({ where: eq(s.user.email, E2E.player.email) });
if (!player) {
  const id = randomUUID();
  await db.insert(s.user).values({ id, name: "Игрок E2E", email: E2E.player.email, emailVerified: true });
  await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(E2E.player.password) });
}

await db
  .insert(s.club)
  .values({ id: E2E.club.id, name: E2E.club.name, city: "Ростов-на-Дону", address: "ул. Тестовая, 1", ownStock: true, pickup: true })
  .onConflictDoNothing();

if (!(await db.query.user.findFirst({ where: eq(s.user.email, `${E2E.kassa.login}@kassa.abramov.shop`) })))
  await createDevice({ name: "Касса E2E", clubId: E2E.club.id, login: E2E.kassa.login, password: E2E.kassa.password }).catch((e) => console.log("[fixtures] касса:", e.message));

const [cat] = await db.insert(s.category).values({ slug: "e2e", name: "Тест E2E", visibility: "PUBLISHED" }).onConflictDoNothing().returning();
const catId = cat?.id ?? (await db.query.category.findFirst({ where: eq(s.category.slug, "e2e") }))!.id;

for (const p of E2E.products) {
  if (await db.query.product.findFirst({ where: eq(s.product.slug, p.slug) })) continue;
  const [prod] = await db.insert(s.product).values({ name: p.name, slug: p.slug, categoryId: catId, price: p.price, visibility: "PUBLISHED", weightGrams: 300 }).returning();
  const [v] = await db.insert(s.productVariant).values({ productId: prod.id, name: "Основной", stock: p.stock, isActive: true, sortOrder: 0, costPrice: Math.round(p.price / 2) }).returning();
  await db.insert(s.clubStock).values({ clubId: E2E.club.id, variantId: v.id, qty: p.club }).onConflictDoNothing();
}
await ensureShopBarcodes();
const { syncSkuToBarcode } = await import("@/lib/shop-barcodes");
await syncSkuToBarcode((await db.select({ id: s.product.id }).from(s.product)).map((x) => x.id));
console.log("[fixtures] готово");
process.exit(0);
