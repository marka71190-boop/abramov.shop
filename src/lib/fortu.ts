/**
 * Заполнение карточек по сайту поставщика «Фортуна» (fortu.ru).
 * 1) Находим товар у поставщика по названию; 2) берём характеристики «имя — значение»;
 * 3) заполняем наши характеристики и пишем описание своим генератором (src/lib/describe.ts).
 * Ничего не перезаписываем: только пустые характеристики и пустое описание. Тексты и фото поставщика не берём.
 * Запросы — по одному, с паузой: сайт поставщика не нагружаем.
 */
import "server-only";
import http from "node:http";
import https from "node:https";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { appliesTo, listAttributes, normalizeAttr, type Attr } from "@/lib/attributes";
import { isGroup, type GroupKey } from "@/lib/attributes-pro";
import { describe } from "@/lib/describe";
import { mapSpecs, parseFortuList, parseFortuProduct, parseFortuRef, searchQueries, shippingGrams, similarity, type Group, type Spec } from "@/lib/fortu-parse";

/** Адрес сайта поставщика; в тестах — заглушка */
const BASE = () => (process.env.FORTU_URL || "https://fortu.ru").replace(/\/$/, "");
/** Ссылка для человека — всегда на настоящий сайт */
export const fortuLink = (path: string) => `https://fortu.ru${path}`;

/** Совпадение названий: от скольки считаем «уверенно» и от скольки вообще берём */
export const SURE = 88;
const MIN = 45;

let lastAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Res {
  status: number;
  location: string | null;
  text: string;
}

function once(url: string, body?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: body ? "POST" : "GET",
        // Сайт поставщика рвёт соединение по TLS 1.3 — говорим с ним по 1.2
        ...(u.protocol === "https:" ? { maxVersion: "TLSv1.2" as const } : {}),
        timeout: 20_000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AbramovShop/1.0)",
          Accept: "text/html,application/json",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "X-Requested-With": "XMLHttpRequest" } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > 3_000_000) req.destroy(new Error("слишком большой ответ"));
          else chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("поставщик не ответил за 20 секунд")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Запрос к поставщику: не чаще раза в 0,7 с, до трёх попыток (соединение у них иногда обрывается) */
async function ask(path: string, form?: Record<string, string>): Promise<Res> {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  let err: unknown;
  for (let i = 0; i < 3; i++) {
    const wait = lastAt + 700 - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    try {
      return await once(`${BASE()}${path}`, body);
    } catch (e) {
      err = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error(`Сайт поставщика не отвечает: ${err instanceof Error ? err.message : "ошибка сети"}`);
}

const pathOf = (location: string) => {
  const m = location.match(/\/product\/[^?#]+/);
  return m ? m[0] : null;
};

/** Кандидаты у поставщика по названию: [{ path, title }] */
async function candidates(name: string) {
  const seen = new Map<string, string>();
  for (const q of searchQueries(name)) {
    const r = await ask(`/search/${encodeURIComponent(q)}`);
    // Точное название или код — поставщик сразу отправляет на карточку
    if (r.status >= 300 && r.status < 400 && r.location) {
      const p = pathOf(r.location);
      if (p) return [{ path: p, title: null as string | null }];
      continue;
    }
    const list = parseFortuList(r.text);
    for (const c of list) seen.set(c.path, c.title);
    // Длинная выдача — догружаем ещё две страницы, как это делает их сайт при прокрутке
    if (list.length >= 15) {
      for (let page = 1; page <= 2; page++) {
        const more = await ask("/search.php", { what: "page", page: String(page), search_str: q }).catch(() => null);
        let html = "";
        try {
          html = more ? String((JSON.parse(more.text) as { success?: string }).success ?? "") : "";
        } catch {}
        const extra = parseFortuList(html);
        for (const c of extra) seen.set(c.path, c.title);
        if (extra.length < 15) break;
      }
    }
    const best = Math.max(0, ...[...seen.values()].map((t) => similarity(name, t)));
    if (best >= SURE) break; // нашли уверенно — дальше не спрашиваем
  }
  return [...seen].map(([path, title]) => ({ path, title: title as string | null }));
}

/** Кандидаты у поставщика с оценкой совпадения названия, лучший — первый */
export async function findOnFortu(name: string) {
  const list = await candidates(name);
  return list.map((c) => ({ ...c, score: c.title ? similarity(name, c.title) : 100 })).sort((a, b) => b.score - a.score);
}

export async function loadCard(path: string) {
  const r = await ask(path);
  if (r.status !== 200) return null;
  return parseFortuProduct(r.text);
}

type Card = typeof s.supplierCard.$inferInsert;
const save = (c: Card) =>
  db
    .insert(s.supplierCard)
    .values(c)
    .onConflictDoUpdate({ target: s.supplierCard.productId, set: { ...c, updatedAt: new Date() } });

/** Найти товар у поставщика и запомнить его характеристики */
export async function matchProduct(productId: string, name: string) {
  try {
    const all = await findOnFortu(name);
    const top = all[0];
    // Несколько одинаково похожих (один товар в разных цветах или размерах) — сами не выбираем наверняка
    const twins = top ? all.filter((c) => top.score - c.score <= 3).length : 0;
    if (!top || top.score < MIN) {
      await save({ productId, status: "NONE", url: null, code: null, title: top?.title ?? null, score: top?.score ?? 0, specs: [], rrp: null, note: top ? "Похожий по названию товар не нашёлся" : "Поиск поставщика ничего не дал", fetchedAt: new Date() });
      return "NONE" as const;
    }
    const card = await loadCard(top.path);
    if (!card) {
      await save({ productId, status: "NONE", url: top.path, code: null, title: top.title, score: top.score, specs: [], rrp: null, note: "Карточка у поставщика не открылась", fetchedAt: new Date() });
      return "NONE" as const;
    }
    // Попали по точному названию — оцениваем по заголовку карточки
    const exact = top.title ? top.score : similarity(name, card.title);
    const score = twins > 1 ? Math.min(exact, SURE - 8) : exact;
    const note = twins > 1 ? `У поставщика ${twins} похожих — проверьте, что это тот цвет и размер` : null;
    await save({ productId, status: "FOUND", url: top.path, code: card.code, title: card.title, score, specs: card.specs, rrp: card.rrp, note, fetchedAt: new Date() });
    return "FOUND" as const;
  } catch (e) {
    // Сеть: не записываем «не нашли» — попробуем в следующий раз
    throw e instanceof Error ? e : new Error("Не получилось спросить поставщика");
  }
}

/** Вручную: ссылка на карточку поставщика или его код товара */
export async function matchByRef(productId: string, raw: string) {
  const ref = parseFortuRef(raw);
  if (!ref) throw new Error("Вставьте ссылку вида fortu.ru/product/… или код товара у поставщика");
  let path = "path" in ref ? ref.path : null;
  if (!path && "code" in ref) {
    const r = await ask(`/search/${encodeURIComponent(ref.code)}`);
    path = r.location ? pathOf(r.location) : (parseFortuList(r.text)[0]?.path ?? null);
  }
  const card = path ? await loadCard(path) : null;
  if (!path || !card) throw new Error("У поставщика такой товар не нашёлся — проверьте ссылку или код");
  // Выбрал человек — значит, верно
  await save({ productId, status: "FOUND", url: path, code: card.code, title: card.title, score: 100, specs: card.specs, rrp: card.rrp, note: null, fetchedAt: new Date() });
}

/** Сколько товаров ещё не искали */
export async function unmatchedCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.product)
    .leftJoin(s.supplierCard, eq(s.supplierCard.productId, s.product.id))
    .where(isNull(s.supplierCard.productId));
  return r?.n ?? 0;
}

/** Очередная порция поиска: столько товаров, сколько успеем за ~20 секунд */
export async function matchBatch() {
  const rows = await db
    .select({ id: s.product.id, name: s.product.name })
    .from(s.product)
    .leftJoin(s.supplierCard, eq(s.supplierCard.productId, s.product.id))
    .where(isNull(s.supplierCard.productId))
    .orderBy(asc(s.product.name))
    .limit(8);
  const started = Date.now();
  let found = 0;
  let none = 0;
  for (const p of rows) {
    const r = await matchProduct(p.id, p.name);
    if (r === "FOUND") found++;
    else none++;
    if (Date.now() - started > 20_000) break;
  }
  return { found, none, left: await unmatchedCount() };
}

// ---------- Что заполнится ----------

const GROUPS: GroupKey[] = ["cues", "tips", "chalk", "balls", "cloth", "tables", "gloves", "merch", "cases"];
export function groupOf(cat: { name: string; slug: string } | null | undefined, name: string): Group {
  const hit = GROUPS.find((g) => isGroup(g, cat));
  if (hit) return hit;
  // Категория не подсказала — смотрим на название товара
  const fake = { name, slug: "" };
  return GROUPS.find((g) => isGroup(g, fake)) ?? "other";
}

const yo = (v: string) => v.toLowerCase().replace(/ё/g, "е").trim();

export interface Plan {
  /** Наши характеристики, которые заполнятся: сейчас пусто, у поставщика есть */
  attrs: { attrId: string; name: string; value: string; show: string }[];
  /** Текст описания; пусто — писать не о чем */
  description: string;
  /** Описание у товара уже есть — не трогаем, если не попросили заменить */
  hasDescription: boolean;
  /** Вес для доставки, граммы; null — не меняем */
  weightGrams: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  weightGrams: number;
}

/** План заполнения одного товара. Справочник при необходимости пополняется в applyCards, здесь — только расчёт */
export function planFor(p: ProductRow, cat: { name: string; slug: string } | null, specs: Spec[], attrs: Attr[], have: Map<string, string>): Plan {
  const group = groupOf(cat, p.name);
  const mapped = mapSpecs(specs, group);
  const out: Plan["attrs"] = [];
  const shown: string[] = [];
  for (const m of mapped) {
    const a = attrs.find((x) => x.key === m.key);
    if (!a || !appliesTo(a, p.categoryId)) continue;
    shown.push(m.from);
    if (have.has(a.id)) continue;
    // Списки «бренд», «страна», «шафт», «турняк» пополняем новым значением; остальные — только из готовых вариантов
    const open = a.type === "select" && ["brand", "country", "shaft", "butt"].includes(a.key);
    // «Зеленый» у поставщика — это наш вариант «Зелёный»
    const same = a.type === "select" ? a.options.find((o) => yo(o) === yo(m.value)) : undefined;
    const norm = normalizeAttr(open && !same ? { ...a, options: [...a.options, m.value] } : a, same ?? m.value);
    if ("error" in norm || !norm.value) continue;
    out.push({ attrId: a.id, name: a.name, value: norm.value, show: a.unit ? `${norm.value.replace(".", ",")} ${a.unit}` : norm.value });
  }
  const g = shippingGrams(specs);
  return {
    attrs: out,
    description: describe({ name: p.name, group, specs, shown }),
    hasDescription: p.description.trim().length > 0,
    // Вес по умолчанию (300 г) — значит, его не вписывали: ставим настоящий
    weightGrams: g && p.weightGrams === 300 && g !== 300 ? g : null,
  };
}

/** Заполнить карточки. overwrite — заменить и уже написанное описание */
export async function applyCards(productIds: string[], overwrite: boolean) {
  const ids = productIds.slice(0, 500);
  if (!ids.length) return { products: 0, attrs: 0, texts: 0 };
  const [cards, products, cats, attrs] = await Promise.all([
    db.select().from(s.supplierCard).where(and(inArray(s.supplierCard.productId, ids), inArray(s.supplierCard.status, ["FOUND", "APPLIED"]))),
    db.select({ id: s.product.id, name: s.product.name, description: s.product.description, categoryId: s.product.categoryId, weightGrams: s.product.weightGrams }).from(s.product).where(inArray(s.product.id, ids)),
    db.select({ id: s.category.id, name: s.category.name, slug: s.category.slug }).from(s.category),
    listAttributes(),
  ]);
  const { attrValues } = await import("@/lib/attributes");
  const vals = await attrValues(ids);
  let n = 0;
  let nAttrs = 0;
  let nTexts = 0;
  for (const c of cards) {
    const p = products.find((x) => x.id === c.productId);
    if (!p) continue;
    const plan = planFor(p, cats.find((x) => x.id === p.categoryId) ?? null, c.specs, attrs, vals.get(p.id) ?? new Map());
    for (const a of plan.attrs) {
      // Новое значение открытого списка — в справочник, чтобы работал фильтр
      const attr = attrs.find((x) => x.id === a.attrId)!;
      if (attr.type === "select" && !attr.options.some((o) => o.toLowerCase() === a.value.toLowerCase())) {
        attr.options = [...attr.options, a.value];
        await db.update(s.attribute).set({ options: attr.options }).where(eq(s.attribute.id, attr.id));
      }
      await db.insert(s.productAttribute).values({ productId: p.id, attributeId: a.attrId, value: a.value }).onConflictDoNothing();
      nAttrs++;
    }
    const patch: Partial<typeof s.product.$inferInsert> = {};
    if (plan.description && (!plan.hasDescription || overwrite)) {
      patch.description = plan.description;
      nTexts++;
    }
    if (plan.weightGrams) patch.weightGrams = plan.weightGrams;
    if (Object.keys(patch).length) await db.update(s.product).set(patch).where(eq(s.product.id, p.id));
    await db.update(s.supplierCard).set({ status: "APPLIED", updatedAt: new Date() }).where(eq(s.supplierCard.productId, p.id));
    n++;
  }
  return { products: n, attrs: nAttrs, texts: nTexts };
}
