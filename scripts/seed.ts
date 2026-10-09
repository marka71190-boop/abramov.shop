/**
 * Начальное наполнение базы. Можно запускать повторно — существующие записи не дублируются.
 * Запуск: npm run db:seed
 *
 * Что делает:
 *  - создаёт текущие редакции согласий (ПДн и рассылки);
 *  - создаёт страницы: политика и согласие (открыты), оферта/доставка/возврат (черновики);
 *  - создаёт категории (кроме «Мел» — скрыты, пока не наполните) и товар Kamui;
 *  - сохраняет настройки по умолчанию;
 *  - выдаёт права владельца пользователю OWNER_EMAIL, если он зарегистрировался раньше,
 *    чем была задана переменная (новые регистрации с этой почтой получают права сразу).
 *
 * На сервере (Docker) запускается сам при каждом старте — вручную ничего делать не нужно.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";
import {
  CONSENT_MARKETING_BODY,
  CONSENT_MARKETING_TITLE,
  CONSENT_PD_BODY,
  CONSENT_PD_TITLE,
  DRAFT_PAGES,
  PRIVACY_BODY,
} from "../src/content/legal";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defaults";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema: s });
const VERSION = "2026-10-09";
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

async function ensureDoc(kind: "PERSONAL_DATA" | "MARKETING", title: string, body: string) {
  const existing = await db.query.consentDocument.findFirst({
    where: and(eq(s.consentDocument.kind, kind), eq(s.consentDocument.version, VERSION)),
  });
  if (existing) return;
  const anyCurrent = await db.query.consentDocument.findFirst({
    where: and(eq(s.consentDocument.kind, kind), eq(s.consentDocument.isCurrent, true)),
  });
  await db.insert(s.consentDocument).values({
    kind,
    version: VERSION,
    title,
    body,
    sha256: sha(body),
    isCurrent: !anyCurrent,
  });
}

async function ensurePage(p: { slug: string; title: string; body: string; visibility: s.Visibility; showInFooter?: boolean; sortOrder?: number }) {
  await db
    .insert(s.page)
    .values({ ...p, showInFooter: p.showInFooter ?? true })
    .onConflictDoNothing({ target: s.page.slug });
}

async function main() {
  await ensureDoc("PERSONAL_DATA", CONSENT_PD_TITLE, CONSENT_PD_BODY);
  await ensureDoc("MARKETING", CONSENT_MARKETING_TITLE, CONSENT_MARKETING_BODY);

  await ensurePage({ slug: "delivery", title: DRAFT_PAGES[1].title, body: DRAFT_PAGES[1].body, visibility: "PUBLISHED", sortOrder: 1 });
  await ensurePage({ slug: "returns", title: DRAFT_PAGES[2].title, body: DRAFT_PAGES[2].body, visibility: "DRAFT", sortOrder: 2 });
  await ensurePage({ slug: "offer", title: DRAFT_PAGES[0].title, body: DRAFT_PAGES[0].body, visibility: "DRAFT", sortOrder: 3 });
  await ensurePage({ slug: "privacy", title: "Политика конфиденциальности", body: PRIVACY_BODY, visibility: "PUBLISHED", sortOrder: 4 });
  // Текст согласия берётся из текущей редакции в журнале согласий, страница — только «обложка»
  await ensurePage({ slug: "consent", title: CONSENT_PD_TITLE, body: "", visibility: "PUBLISHED", sortOrder: 5 });
  await ensurePage({ slug: "marketing-consent", title: CONSENT_MARKETING_TITLE, body: "", visibility: "PUBLISHED", showInFooter: false, sortOrder: 6 });

  const categories = [
    { slug: "chalk", name: "Мел", visibility: "PUBLISHED" as const, sortOrder: 1, image: "/images/kamui-2.jpg" },
    { slug: "cues", name: "Кии", visibility: "HIDDEN" as const, sortOrder: 2 },
    { slug: "gloves", name: "Перчатки", visibility: "HIDDEN" as const, sortOrder: 3 },
    { slug: "accessories", name: "Аксессуары", visibility: "HIDDEN" as const, sortOrder: 4 },
    { slug: "merch", name: "Мерч", visibility: "HIDDEN" as const, sortOrder: 5 },
  ];
  for (const c of categories) {
    await db.insert(s.category).values(c).onConflictDoNothing({ target: s.category.slug });
  }

  const chalk = await db.query.category.findFirst({ where: eq(s.category.slug, "chalk") });
  const kamuiSlug = "kamui-iosif-abramov-098b";
  const hasKamui = await db.query.product.findFirst({ where: eq(s.product.slug, kamuiSlug) });
  if (!hasKamui) {
    const [p] = await db
      .insert(s.product)
      .values({
        slug: kamuiSlug,
        name: "Бильярдный мел Kamui × Iosif Abramov — Limited Edition 0.98 β",
        description:
          "Лимитированная серия бильярдного мела Kamui × Iosif Abramov 0.98 β. Японские технологии Kamui и опыт одного из сильнейших игроков современного бильярда. Всего 2000 экземпляров.",
        categoryId: chalk?.id,
        price: 350000,
        sku: "KAMUI-ABRAMOV-098B",
        visibility: "PUBLISHED",
        isLimited: true,
        limitedTotal: 2000,
        weightGrams: 100,
        sortOrder: 1,
      })
      .returning();
    await db.insert(s.productVariant).values({ productId: p.id, name: "Стандарт", stock: 1951 });
    await db.insert(s.productImage).values([
      { productId: p.id, url: "/images/kamui-1.jpg", alt: "Мел Kamui × Iosif Abramov на бильярдном столе", sortOrder: 1 },
      { productId: p.id, url: "/images/kamui-2.jpg", alt: "Мел Kamui × Iosif Abramov крупным планом", sortOrder: 2 },
      { productId: p.id, url: "/images/kamui-3.jpg", alt: "Мел Kamui × Iosif Abramov в руке", sortOrder: 3 },
    ]);
  }

  await db.insert(s.setting).values({ key: "site", value: DEFAULT_SETTINGS }).onConflictDoNothing({ target: s.setting.key });

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail) {
    const res = await db.update(s.user).set({ role: "OWNER" }).where(eq(s.user.email, ownerEmail)).returning({ id: s.user.id });
    console.log(
      res.length
        ? `Права владельца выданы: ${ownerEmail}`
        : `Владелец ${ownerEmail} ещё не зарегистрирован — права выдадутся сами при регистрации с этой почтой.`,
    );
  }

  console.log("Начальные данные готовы");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
