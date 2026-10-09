"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";

export interface ActionState {
  ok?: string;
  error?: string;
}

function banTicket() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return `BAN-${100000 + n}`;
}

// ---------------- Клиенты ----------------

const BanInput = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(3, "Укажите причину — её увидит клиент").max(500),
  duration: z.enum(["1", "3", "7", "30", "90", "forever", "custom"]),
  until: z.string().optional(),
});

export async function banUser(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = BanInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { userId, reason, duration, until } = p.data;

  const target = await db.query.user.findFirst({ where: eq(s.user.id, userId) });
  if (!target) return { error: "Клиент не найден" };
  if (target.id === me.id) return { error: "Нельзя заблокировать самого себя" };
  if (target.role === "OWNER") return { error: "Владельца заблокировать нельзя" };
  if (target.role === "MANAGER" && me.role !== "OWNER") return { error: "Менеджера может заблокировать только владелец" };

  let bannedUntil: Date | null = null;
  if (duration === "custom") {
    const d = until ? new Date(`${until}T23:59:59+03:00`) : null;
    if (!d || Number.isNaN(+d) || d <= new Date()) return { error: "Укажите дату окончания в будущем" };
    bannedUntil = d;
  } else if (duration !== "forever") {
    bannedUntil = new Date(Date.now() + Number(duration) * 24 * 3600_000);
  }

  // Номер обращения уникален — на случай совпадения пробуем ещё раз
  for (let i = 0; i < 5; i++) {
    try {
      await db
        .update(s.user)
        .set({ bannedAt: new Date(), bannedUntil, banReason: reason, banTicket: banTicket(), bannedById: me.id })
        .where(eq(s.user.id, userId));
      break;
    } catch (e) {
      if (i === 4) throw e;
    }
  }
  await audit(me.id, "user.ban", "user", userId, { reason, until: bannedUntil });
  revalidatePath(`/admin/customers/${userId}`);
  return { ok: "Клиент заблокирован. При входе он увидит окно с причиной." };
}

export async function unbanUser(userId: string) {
  const me = await requireAdmin();
  await db
    .update(s.user)
    .set({ bannedAt: null, bannedUntil: null, banReason: null, banTicket: null, bannedById: null })
    .where(eq(s.user.id, userId));
  await audit(me.id, "user.unban", "user", userId);
  revalidatePath(`/admin/customers/${userId}`);
}

const BonusInput = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().int().refine((n) => n !== 0, "Укажите количество бонусов, например 500 или -200"),
  comment: z.string().trim().min(2, "Напишите комментарий — за что начисление").max(300),
});

export async function adjustBonus(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = BonusInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { userId, amount, comment } = p.data;

  const res = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(s.user)
      .set({ bonusBalance: sql`${s.user.bonusBalance} + ${amount}` })
      .where(eq(s.user.id, userId))
      .returning({ balance: s.user.bonusBalance });
    if (!u) return { error: "Клиент не найден" };
    if (u.balance < 0) {
      tx.rollback();
    }
    await tx.insert(s.bonusTransaction).values({ userId, amount, reason: "MANUAL", comment, createdById: me.id });
    return { balance: u.balance };
  }).catch(() => ({ error: "На счёте недостаточно бонусов для списания" }));

  if ("error" in res) return { error: res.error };
  await audit(me.id, "user.bonus", "user", userId, { amount, comment });
  revalidatePath(`/admin/customers/${userId}`);
  return { ok: `Готово. Баланс: ${res.balance} бонусов` };
}

export async function setRole(userId: string, role: "CUSTOMER" | "MANAGER" | "OWNER") {
  const me = await requireAdmin("OWNER");
  if (userId === me.id && role !== "OWNER") throw new Error("Нельзя снять права владельца с самого себя");
  await db.update(s.user).set({ role }).where(eq(s.user.id, userId));
  await audit(me.id, "user.role", "user", userId, { role });
  revalidatePath(`/admin/customers/${userId}`);
}

// ---------------- Видимость: страницы, категории, товары ----------------

const Vis = z.enum(["DRAFT", "HIDDEN", "PUBLISHED"]);
const TABLES = { page: s.page, category: s.category, product: s.product } as const;

export async function setVisibility(entity: keyof typeof TABLES, id: string, visibility: string) {
  const me = await requireAdmin();
  const v = Vis.parse(visibility);
  const t = TABLES[entity];
  await db.update(t).set({ visibility: v }).where(eq(t.id, id));
  await audit(me.id, `${entity}.visibility`, entity, id, { visibility: v });
  revalidatePath("/", "layout");
}

// ---------------- Страницы ----------------

const PageInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Введите заголовок").max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Адрес — латиница, цифры и дефис, например delivery")
    .max(80),
  body: z.string().max(100_000),
  visibility: Vis,
  publishAt: z.string().optional(),
  showInFooter: z.string().optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function savePage(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = PageInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const publishAt = d.publishAt ? new Date(`${d.publishAt}:00+03:00`) : null;
  if (publishAt && Number.isNaN(+publishAt)) return { error: "Неверная дата публикации" };

  const values = {
    title: d.title,
    slug: d.slug,
    body: d.body,
    visibility: d.visibility,
    publishAt,
    showInFooter: d.showInFooter === "on",
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
    sortOrder: d.sortOrder,
  };

  try {
    if (d.id) {
      await db.update(s.page).set(values).where(eq(s.page.id, d.id));
      await audit(me.id, "page.update", "page", d.id, { slug: d.slug, visibility: d.visibility });
    } else {
      const [row] = await db.insert(s.page).values(values).returning({ id: s.page.id });
      await audit(me.id, "page.create", "page", row.id, { slug: d.slug });
      revalidatePath("/", "layout");
      redirect(`/admin/pages/${row.id}?saved=1`);
    }
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) return { error: "Страница с таким адресом уже есть" };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: "Сохранено" };
}

export async function deletePage(id: string) {
  const me = await requireAdmin("OWNER");
  const pg = await db.query.page.findFirst({ where: eq(s.page.id, id) });
  if (pg && ["privacy", "consent", "marketing-consent"].includes(pg.slug)) {
    throw new Error("Эту страницу нельзя удалить — она нужна для согласий");
  }
  await db.delete(s.page).where(eq(s.page.id, id));
  await audit(me.id, "page.delete", "page", id, { slug: pg?.slug });
  revalidatePath("/", "layout");
  redirect("/admin/pages");
}

// ---------------- Настройки ----------------

const SettingsInput = z.object({
  maintenance: z.string().optional(),
  maintenanceMessage: z.string().trim().max(500),
  supportTelegram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9_]{4,32}$/, "Telegram — только имя, например abramov_shop1")),
  supportEmail: z.email("Проверьте почту поддержки"),
  silverPercent: z.coerce.number().min(0).max(100),
  goldPercent: z.coerce.number().min(0).max(100),
  blackPercent: z.coerce.number().min(0).max(100),
  goldThreshold: z.coerce.number().int().min(0),
  blackThreshold: z.coerce.number().int().min(0),
  maxSpendPercent: z.coerce.number().int().min(0).max(100),
  welcomeBonus: z.coerce.number().int().min(0),
  referralBonus: z.coerce.number().int().min(0),
  birthdayBonus: z.coerce.number().int().min(0),
  expiryDays: z.coerce.number().int().min(0),
});

export async function updateSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = SettingsInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  if (d.blackThreshold <= d.goldThreshold) return { error: "Порог Black должен быть больше порога Gold" };
  await saveSettings({
    maintenance: d.maintenance === "on",
    maintenanceMessage: d.maintenanceMessage,
    supportTelegram: d.supportTelegram,
    supportEmail: d.supportEmail,
    loyalty: {
      tiers: {
        SILVER: { percent: d.silverPercent, threshold: 0 },
        GOLD: { percent: d.goldPercent, threshold: d.goldThreshold },
        BLACK: { percent: d.blackPercent, threshold: d.blackThreshold },
      },
      maxSpendPercent: d.maxSpendPercent,
      welcomeBonus: d.welcomeBonus,
      referralBonus: d.referralBonus,
      birthdayBonus: d.birthdayBonus,
      expiryDays: d.expiryDays,
    },
  });
  await audit(me.id, "settings.update", "setting", "site", d);
  revalidatePath("/", "layout");
  return { ok: "Настройки сохранены" };
}
