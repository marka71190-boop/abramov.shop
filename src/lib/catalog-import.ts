/**
 * Каталог в Excel: шаблон, выгрузка текущих товаров и загрузка (создание и обновление).
 *
 * Одна строка таблицы — один вариант товара. Строки с одинаковым «Артикулом товара» — варианты
 * одного товара. Пустая ячейка при обновлении — поле не меняется. Варианты, которых нет в файле,
 * не удаляются. Фото — ссылками: внешние картинки сайт скачивает и хранит у себя.
 */
import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import ExcelJS from "exceljs";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { saveImageBuffer } from "@/lib/media-upload";
import { SITE } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { listAttributes, normalizeAttr, type Attr } from "@/lib/attributes";
import { parseVideoLines } from "@/lib/video";

export const COLUMNS = [
  { key: "productSku", title: "Артикул товара", width: 20, note: "Обязательно. Строки с одинаковым артикулом — варианты одного товара (цвет, размер)." },
  { key: "name", title: "Название", width: 42, note: "Обязательно для нового товара. У вариантов можно не повторять." },
  { key: "category", title: "Категория", width: 18, note: "Название категории, например «Кии». Если такой нет — сайт создаст." },
  { key: "variant", title: "Вариант", width: 18, note: "Например «13 мм» или «Чёрный». Если у товара один вариант — оставьте пустым." },
  { key: "variantSku", title: "Артикул варианта", width: 20, note: "Необязательно. Нужен, если у вариантов свои артикулы." },
  { key: "price", title: "Цена, ₽", width: 11, note: "Обязательно. Цена этого варианта." },
  { key: "oldPrice", title: "Старая цена, ₽", width: 14, note: "Зачёркнутая цена — больше текущей. 0 — убрать." },
  { key: "stock", title: "Остаток, шт", width: 12, note: "Обязательно." },
  { key: "visibility", title: "Показывать", width: 13, note: "Да, Нет или Черновик. Новый товар без отметки — черновик." },
  { key: "description", title: "Описание", width: 50, note: "Текст на странице товара. Пустая ячейка — описание не меняется." },
  { key: "tags", title: "Слова для поиска", width: 30, note: "Через запятую: другие написания, бренд по-русски. Например: Джос, камуи." },
  { key: "photos", title: "Фото (ссылки)", width: 50, note: "Ссылки на картинки через пробел или с новой строки. Фото в строке — фото этого варианта." },
  { key: "weight", title: "Вес, г", width: 9, note: "Для расчёта доставки СДЭК. По умолчанию 300." },
  { key: "length", title: "Длина, см", width: 10, note: "Размеры упаковки для СДЭК. По умолчанию 10." },
  { key: "width", title: "Ширина, см", width: 10, note: "" },
  { key: "height", title: "Высота, см", width: 10, note: "" },
  { key: "limited", title: "Тираж", width: 10, note: "Для лимитированной серии — общий тираж. Пусто — обычный товар." },
  { key: "videos", title: "Видео (ссылки)", width: 40, note: "Ссылки VK Видео, Rutube или YouTube — каждая с новой строки, после «|» можно подпись. «-» — убрать все видео." },
  { key: "channel", title: "Где продаётся", width: 16, note: "Розница, Опт или Розница и опт. Пусто — не меняется (новый товар — розница)." },
  { key: "wholesalePrice", title: "Оптовая цена, ₽", width: 14, note: "Для «Розница и опт». 0 — как в рознице." },
  { key: "wholesaleMin", title: "Мин. партия, шт", width: 13, note: "Для опта: от скольких штук продаём." },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
/** attrs: id характеристики → значение из ячейки */
export type RawRow = { row: number; attrs?: Record<string, string> } & Partial<Record<ColKey, string>>;

/** Колонка характеристики: «Характеристика: Вес, г» — отличается от «Вес, г» для доставки */
export const ATTR_PREFIX = "Характеристика: ";
export const attrTitle = (a: Pick<Attr, "name" | "unit">) => `${ATTR_PREFIX}${a.name}${a.unit ? `, ${a.unit}` : ""}`;
const CHANNEL: Record<string, "RETAIL" | "WHOLESALE" | "BOTH"> = { розница: "RETAIL", опт: "WHOLESALE", розницаиопт: "BOTH", оптирозница: "BOTH" };
const CHANNEL_TEXT = { RETAIL: "Розница", WHOLESALE: "Опт", BOTH: "Розница и опт" } as const;

// ---------- Разбор ячеек

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String(v.hyperlink || v.text || "");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  return "";
}
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, "");
export function num(s: string | undefined): number | null {
  if (!s?.trim()) return null;
  const n = Number(s.replace(/\s| /g, "").replace(",", ".").replace(/[₽рруб.]+$/i, ""));
  return Number.isFinite(n) ? n : NaN;
}
function visibility(s: string | undefined): "PUBLISHED" | "HIDDEN" | "DRAFT" | null | "bad" {
  const v = norm(s ?? "");
  if (!v) return null;
  if (["да", "yes", "1", "опубликован", "опубликовано", "показывать", "published"].includes(v)) return "PUBLISHED";
  if (["нет", "no", "0", "скрыт", "скрыто", "hidden"].includes(v)) return "HIDDEN";
  if (["черновик", "draft"].includes(v)) return "DRAFT";
  return "bad";
}
const photoList = (s: string | undefined) => (s ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^(https?:\/\/|\/(media|images)\/)/i.test(x));

export async function readWorkbook(buf: Buffer): Promise<{ rows: RawRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { rows: [], error: "Не получилось открыть файл. Нужен файл Excel (.xlsx) — в Google Таблицах: Файл → Скачать → Microsoft Excel" };
  }
  const ws = wb.getWorksheet("Товары") ?? wb.worksheets[0];
  if (!ws) return { rows: [], error: "В файле нет листов" };
  // Строка заголовков — первая, где есть «Артикул товара»
  const attrs = await listAttributes();
  let headerRow = 0;
  const map = new Map<number, ColKey>();
  const attrCols = new Map<number, string>();
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found = new Map<number, ColKey>();
    const foundAttr = new Map<number, string>();
    row.eachCell((c, col) => {
      const raw = cellText(c.value).trim();
      const h = norm(raw);
      if (raw.toLowerCase().startsWith(ATTR_PREFIX.trim().toLowerCase())) {
        const a = attrs.find((x) => norm(attrTitle(x)) === h || norm(`${ATTR_PREFIX}${x.name}`) === h);
        if (a) foundAttr.set(col, a.id);
        return;
      }
      const def = COLUMNS.find((x) => norm(x.title) === h) ?? COLUMNS.find((x) => h && norm(x.title).startsWith(h) && h.length > 3);
      if (def) found.set(col, def.key);
    });
    if ([...found.values()].includes("productSku")) {
      headerRow = r;
      found.forEach((v, k) => map.set(k, v));
      foundAttr.forEach((v, k) => attrCols.set(k, v));
      break;
    }
  }
  if (!headerRow) return { rows: [], error: "Не нашёл строку заголовков: в первой строке должны быть колонки из шаблона, начиная с «Артикул товара»" };
  for (const req of ["price", "stock"] as const) {
    if (![...map.values()].includes(req)) return { rows: [], error: `В таблице нет колонки «${COLUMNS.find((c) => c.key === req)!.title}»` };
  }
  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const out: RawRow = { row: r };
    let any = false;
    map.forEach((key, col) => {
      const v = cellText(row.getCell(col).value).trim();
      if (v) {
        out[key] = v;
        any = true;
      }
    });
    attrCols.forEach((id, col) => {
      const v = cellText(row.getCell(col).value).trim();
      if (v) {
        out.attrs = { ...out.attrs, [id]: v };
        any = true;
      }
    });
    if (any) rows.push(out);
    if (rows.length > 3000) return { rows: [], error: "Слишком много строк: за один раз — до 3000" };
  }
  return { rows };
}

// ---------- План загрузки

export const VariantImport = z.object({
  name: z.string().max(120).nullable(),
  sku: z.string().max(60).nullable(),
  price: z.number().int().min(100),
  oldPrice: z.number().int().min(0).nullable(), // 0 — убрать
  stock: z.number().int().min(0).max(1_000_000),
  photos: z.array(z.string().max(1000)).max(20),
});
export const ProductImport = z.object({
  productSku: z.string().min(1).max(60),
  name: z.string().max(200).nullable(),
  category: z.string().max(120).nullable(),
  visibility: z.enum(["PUBLISHED", "HIDDEN", "DRAFT"]).nullable(),
  description: z.string().max(20_000).nullable(),
  tags: z.string().max(1000).nullable(),
  weight: z.number().int().min(1).max(100_000).nullable(),
  length: z.number().int().min(1).max(300).nullable(),
  width: z.number().int().min(1).max(300).nullable(),
  height: z.number().int().min(1).max(300).nullable(),
  limited: z.number().int().min(1).max(1_000_000).nullable(),
  /** Характеристики: значение или null — очистить; отсутствует — не менять */
  attrs: z.record(z.string().max(64), z.string().max(200).nullable()).default({}),
  /** Видео: массив (пустой — убрать) или null — не менять */
  videos: z.array(z.object({ url: z.string().max(500), title: z.string().max(120) })).max(10).nullable().default(null),
  channel: z.enum(["RETAIL", "WHOLESALE", "BOTH"]).nullable().default(null),
  wholesalePrice: z.number().int().min(0).nullable().default(null), // 0 — как в рознице
  wholesaleMin: z.number().int().min(1).max(10_000).nullable().default(null),
  variants: z.array(VariantImport).min(1).max(100),
});
export type ProductImportT = z.infer<typeof ProductImport>;

export interface PlanItem {
  input: ProductImportT;
  rows: number[];
  action: "create" | "update";
  name: string;
  changes: string[];
}
export interface Plan {
  items: PlanItem[];
  errors: { row: number; text: string }[];
  newCategories: string[];
  /** Категории из файла, которые скрыты на сайте — товары в них покупатели не увидят */
  hiddenCategories: string[];
}

/** Ссылки на свои картинки — путём /media/…, чтобы сравнивать с тем, что уже в базе */
const ownPath = (u: string) => {
  const p = u.replace(SITE.url, "").split("?")[0];
  return /^\/(media|images)\//.test(p) ? p : u;
};

const rub = (k: number) => `${(k / 100).toLocaleString("ru-RU")} ₽`;

export async function buildPlan(rows: RawRow[]): Promise<Plan> {
  let attrList: Attr[] | null = null;
  const attrsCached = async () => (attrList ??= await listAttributes());
  const errors: Plan["errors"] = [];
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const sku = r.productSku?.trim();
    if (!sku) {
      errors.push({ row: r.row, text: "Нет артикула товара" });
      continue;
    }
    const k = sku.toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const skus = [...groups.values()].map((g) => g[0].productSku!.trim());
  const existing = skus.length
    ? await db.query.product.findMany({
        where: sql`lower(${s.product.sku}) in ${skus.map((x) => x.toLowerCase())} or ${s.product.slug} in ${skus.map((x) => x.toLowerCase())}`,
        with: { variants: true, images: true },
      })
    : [];
  const cats = await db.select({ id: s.category.id, name: s.category.name, visibility: s.category.visibility }).from(s.category);
  const newCats = new Set<string>();
  const hiddenCats = new Set<string>();
  const items: PlanItem[] = [];

  for (const g of groups.values()) {
    const first = g[0];
    const sku = first.productSku!.trim();
    const prod = existing.find((p) => p.sku?.toLowerCase() === sku.toLowerCase()) ?? existing.find((p) => p.slug === sku.toLowerCase());
    const pick = (k: ColKey) => g.map((r) => r[k]).find((v) => v?.trim()) ?? null;
    const rowErr = (row: number, text: string) => errors.push({ row, text: `${sku}: ${text}` });
    let bad = false;

    const vis = visibility(pick("visibility") ?? undefined);
    if (vis === "bad") {
      rowErr(first.row, "в колонке «Показывать» — Да, Нет или Черновик");
      bad = true;
    }
    const ints: Partial<Record<"weight" | "length" | "width" | "height" | "limited", number | null>> = {};
    for (const k of ["weight", "length", "width", "height", "limited"] as const) {
      const v = num(pick(k) ?? undefined);
      if (v != null && (!Number.isFinite(v) || v <= 0)) {
        rowErr(first.row, `«${COLUMNS.find((c) => c.key === k)!.title}» — положительное число`);
        bad = true;
      }
      ints[k] = v != null && Number.isFinite(v) ? Math.round(v) : null;
    }
    // Характеристики: первая непустая ячейка по товару
    const attrDefs = await attrsCached();
    const attrIn: Record<string, string | null> = {};
    for (const a of attrDefs) {
      const raw = g.map((r) => r.attrs?.[a.id]).find((v) => v?.trim());
      if (!raw) continue;
      if (/^[-–—]$/.test(raw.trim())) {
        attrIn[a.id] = null;
        continue;
      }
      const r = normalizeAttr(a, raw);
      if ("error" in r) {
        rowErr(first.row, r.error);
        bad = true;
      } else attrIn[a.id] = r.value;
    }
    let videos: ProductImportT["videos"] = null;
    const vRaw = pick("videos");
    if (vRaw) {
      if (/^[-–—]$/.test(vRaw.trim())) videos = [];
      else {
        const r = parseVideoLines(vRaw);
        if (r.errors.length) {
          rowErr(first.row, `видео не распознано: ${r.errors[0]} — нужна ссылка VK Видео, Rutube или YouTube`);
          bad = true;
        } else videos = r.videos;
      }
    }
    const chRaw = pick("channel");
    const channel = chRaw ? (CHANNEL[norm(chRaw)] ?? null) : null;
    if (chRaw && !channel) {
      rowErr(first.row, "«Где продаётся» — Розница, Опт или Розница и опт");
      bad = true;
    }
    const wp = num(pick("wholesalePrice") ?? undefined);
    if (wp != null && (!Number.isFinite(wp) || wp < 0)) {
      rowErr(first.row, "оптовая цена — число, 0 — как в рознице");
      bad = true;
    }
    const wm = num(pick("wholesaleMin") ?? undefined);
    if (wm != null && (!Number.isFinite(wm) || wm < 1 || !Number.isInteger(wm))) {
      rowErr(first.row, "минимальная партия — целое число от 1");
      bad = true;
    }
    if (!prod && !pick("name")) {
      rowErr(first.row, "у нового товара нужно название");
      bad = true;
    }
    if (g.length > 1 && g.some((r) => !r.variant?.trim() && !r.variantSku?.trim())) {
      rowErr(first.row, "у товара несколько строк — заполните «Вариант» в каждой");
      bad = true;
    }

    const variants: ProductImportT["variants"] = [];
    const seen = new Set<string>();
    for (const r of g) {
      const price = num(r.price), old = num(r.oldPrice), stock = num(r.stock);
      if (price == null || !Number.isFinite(price) || price < 1) {
        rowErr(r.row, "цена — число от 1 ₽");
        bad = true;
        continue;
      }
      if (stock == null || !Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
        rowErr(r.row, "остаток — целое число от 0");
        bad = true;
        continue;
      }
      if (old != null && (!Number.isFinite(old) || (old > 0 && old <= price))) {
        rowErr(r.row, "старая цена должна быть больше цены (или 0, чтобы убрать)");
        bad = true;
        continue;
      }
      const key = (r.variantSku || r.variant || "").toLowerCase();
      if (seen.has(key)) {
        rowErr(r.row, `вариант «${r.variant || r.variantSku}» повторяется`);
        bad = true;
        continue;
      }
      seen.add(key);
      variants.push({
        name: r.variant?.trim() || null,
        sku: r.variantSku?.trim() || null,
        price: Math.round(price * 100),
        oldPrice: old == null ? null : Math.round(old * 100),
        stock,
        photos: photoList(r.photos).slice(0, 20),
      });
    }
    if (bad || !variants.length) continue;

    const catName = pick("category");
    const cat = catName ? cats.find((c) => norm(c.name) === norm(catName)) : undefined;
    if (catName && !cat) newCats.add(catName.trim());
    if (cat && cat.visibility !== "PUBLISHED") hiddenCats.add(cat.name);

    const input: ProductImportT = {
      productSku: sku,
      name: pick("name"),
      category: catName,
      visibility: vis as ProductImportT["visibility"],
      description: pick("description"),
      tags: pick("tags"),
      weight: ints.weight ?? null,
      length: ints.length ?? null,
      width: ints.width ?? null,
      height: ints.height ?? null,
      limited: ints.limited ?? null,
      attrs: attrIn,
      videos,
      channel,
      wholesalePrice: wp != null && Number.isFinite(wp) ? Math.round(wp * 100) : null,
      wholesaleMin: wm != null && Number.isFinite(wm) ? wm : null,
      variants,
    };

    // Что поменяется — для предпросмотра
    const changes: string[] = [];
    if (!prod) {
      if (Object.keys(input.attrs).length) changes.push(`характеристики: ${Object.keys(input.attrs).length}`);
      if (input.videos?.length) changes.push(`видео: ${input.videos.length}`);
      changes.push(`${variants.length > 1 ? `${variants.length} варианта(ов), ` : ""}цена ${rub(variants[0].price)}, остаток ${variants.reduce((a, v) => a + v.stock, 0)}`);
      const ph = variants.reduce((a, v) => a + v.photos.length, 0);
      if (ph) changes.push(`фото: ${ph}`);
    } else {
      if (input.name && input.name !== prod.name) changes.push("название");
      for (const v of variants) {
        const ev = matchVariant(prod.variants, v, variants.length);
        const label = v.name ? `«${v.name}»: ` : "";
        if (!ev) {
          changes.push(`${label}новый вариант`);
          continue;
        }
        const evPrice = ev.price ?? prod.price;
        if (evPrice !== v.price) changes.push(`${label}цена ${rub(evPrice)} → ${rub(v.price)}`);
        if (ev.stock !== v.stock) changes.push(`${label}остаток ${ev.stock} → ${v.stock}`);
      }
      if (input.visibility && input.visibility !== prod.visibility) changes.push(input.visibility === "PUBLISHED" ? "показать" : "скрыть");
      if (input.description && input.description !== prod.description) changes.push("описание");
      if (variants.some((v, i) => v.photos.length && !samePhotos(prod, v, i, variants.length))) changes.push("фото");
      if (input.category && prod.categoryId !== cat?.id) changes.push("категория");
      if (Object.keys(input.attrs).length) {
        const have = new Map((await db.select().from(s.productAttribute).where(eq(s.productAttribute.productId, prod.id))).map((x) => [x.attributeId, x.value]));
        const n = Object.entries(input.attrs).filter(([id, v]) => (have.get(id) ?? null) !== v).length;
        if (n) changes.push(`характеристики: ${n}`);
      }
      if (input.videos && JSON.stringify(input.videos) !== JSON.stringify(prod.videos)) changes.push(input.videos.length ? "видео" : "убрать видео");
      if (input.channel && input.channel !== prod.channel) changes.push(`продажа: ${CHANNEL_TEXT[input.channel].toLowerCase()}`);
      if (input.wholesalePrice != null && (input.wholesalePrice || null) !== prod.wholesalePrice) changes.push("оптовая цена");
      if (!changes.length) changes.push("без изменений");
    }
    items.push({ input, rows: g.map((r) => r.row), action: prod ? "update" : "create", name: input.name || prod?.name || sku, changes });
  }
  return { items, errors, newCategories: [...newCats], hiddenCategories: [...hiddenCats] };
}

/** Фото в файле те же, что уже у товара (обычно — после выгрузки каталога) */
function samePhotos(
  prod: { variants: VariantRow[]; images: { url: string; variantId: string | null }[] },
  v: { name: string | null; sku: string | null; photos: string[] },
  _i: number,
  inputCount: number,
) {
  const single = prod.variants.length <= 1 && inputCount <= 1;
  const ev = matchVariant(prod.variants, v, inputCount);
  const have = (single ? prod.images : prod.images.filter((im) => ev && im.variantId === ev.id)).map((im) => im.url);
  const want = v.photos.map(ownPath);
  return have.length === want.length && have.every((u, k) => u === want[k]);
}

type VariantRow = typeof s.productVariant.$inferSelect;
function matchVariant(list: VariantRow[], v: { name: string | null; sku: string | null }, inputCount: number) {
  if (v.sku) {
    const bySku = list.find((x) => x.sku?.toLowerCase() === v.sku!.toLowerCase());
    if (bySku) return bySku;
  }
  if (v.name) {
    const byName = list.find((x) => x.name.toLowerCase() === v.name!.toLowerCase());
    if (byName) return byName;
  }
  // Товар с одним вариантом — строка относится к нему
  if (inputCount === 1 && list.length === 1) return list[0];
  return undefined;
}

// ---------- Фото по ссылке

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — внутренняя сеть провайдера
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  // IPv4 внутри IPv6 (::ffff:10.0.0.1) проверяем как IPv4; остальные ::ffff:… не пускаем
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateIp(mapped[1]);
  return v === "::1" || v === "::" || v.startsWith("::ffff:") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

const PHOTO_MAX = 15 * 1024 * 1024;

/** Адрес можно скачивать: http(s) и сайт не во внутренней сети (проверяем все адреса из DNS). */
async function assertPublicUrl(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("ссылка должна начинаться с http");
  const addrs = await Promise.race([
    lookup(u.hostname, { all: true }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("сайт с фото не отвечает")), 8000)),
  ]).catch((e) => {
    throw new Error(e instanceof Error && e.message.startsWith("сайт") ? e.message : "сайт с фото не найден");
  });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("адрес недоступен");
}

/** Своя картинка — адрес как есть; чужая — скачиваем, уменьшаем и храним у себя. */
export async function importPhoto(url: string, userId: string): Promise<string> {
  const own = url.replace(SITE.url, "");
  if (/^\/(media|images)\//.test(own)) return own.split("?")[0];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("неверная ссылка");
  }
  // Google Диск: ссылка «поделиться» → прямая
  const gd = u.hostname === "drive.google.com" && u.pathname.match(/\/file\/d\/([^/]+)/);
  if (gd) u = new URL(`https://drive.google.com/uc?export=download&id=${gd[1]}`);
  // Перенаправления проходим сами: каждый следующий адрес тоже проверяем, иначе
  // внешняя ссылка могла бы увести запрос во внутреннюю сеть сервера
  let res: Response | null = null;
  for (let hop = 0; hop < 5 && !res; hop++) {
    await assertPublicUrl(u);
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "AbramovShop/1.0 (catalog import)" } });
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!loc) res = r;
    else {
      await r.body?.cancel().catch(() => {});
      u = new URL(loc, u);
    }
  }
  if (!res) throw new Error("слишком много перенаправлений");
  if (!res.ok) throw new Error(`не скачалось (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  const len = Number(res.headers.get("content-length") || 0);
  if (len > PHOTO_MAX) throw new Error("картинка больше 15 МБ");
  if (!/^image\//.test(type) && !/octet-stream/.test(type)) throw new Error("по ссылке не картинка — нужна прямая ссылка на фото");
  // Читаем по кускам: сервер мог не указать размер или указать неправду
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > PHOTO_MAX) {
      await reader.cancel().catch(() => {});
      throw new Error("картинка больше 15 МБ");
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  try {
    return await saveImageBuffer(buf, userId);
  } catch {
    throw new Error("не получилось прочитать картинку");
  }
}

// ---------- Применение одного товара

async function uniqueSlug(base: string) {
  const root = slugify(base) || "tovar";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    if (!(await db.query.product.findFirst({ where: eq(s.product.slug, slug), columns: { id: true } }))) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function categoryId(name: string | null) {
  if (!name) return undefined;
  const all = await db.select({ id: s.category.id, name: s.category.name, slug: s.category.slug }).from(s.category);
  const found = all.find((c) => norm(c.name) === norm(name));
  if (found) return found.id;
  let slug = slugify(name) || "category";
  if (all.some((c) => c.slug === slug)) slug = `${slug}-${all.length + 1}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${s.category.sortOrder}), 0)::int` }).from(s.category);
  const [c] = await db.insert(s.category).values({ name: name.trim(), slug, visibility: "PUBLISHED", sortOrder: max + 1 }).onConflictDoNothing().returning({ id: s.category.id });
  return c?.id ?? (await db.query.category.findFirst({ where: eq(s.category.slug, slug) }))?.id;
}

export interface ApplyResult {
  sku: string;
  ok: boolean;
  created?: boolean;
  productId?: string;
  error?: string;
  warnings: string[];
  backInStock?: boolean;
}

export async function applyProduct(input: ProductImportT, userId: string): Promise<ApplyResult> {
  const warnings: string[] = [];
  const sku = input.productSku;
  const prod =
    (await db.query.product.findFirst({ where: sql`lower(${s.product.sku}) = ${sku.toLowerCase()}`, with: { variants: { orderBy: asc(s.productVariant.sortOrder) } } })) ??
    (await db.query.product.findFirst({ where: eq(s.product.slug, sku.toLowerCase()), with: { variants: { orderBy: asc(s.productVariant.sortOrder) } } }));
  if (!prod && !input.name) return { sku, ok: false, error: "нет названия", warnings };

  // Фото — до транзакции: скачивание может быть долгим
  const photos = new Map<number, string[]>();
  const prodWithImages = prod ? { variants: prod.variants, images: await db.select({ url: s.productImage.url, variantId: s.productImage.variantId }).from(s.productImage).where(eq(s.productImage.productId, prod.id)) } : null;
  for (const [i, v] of input.variants.entries()) {
    if (!v.photos.length) continue;
    if (prodWithImages && samePhotos(prodWithImages, v, i, input.variants.length)) continue;
    const urls: string[] = [];
    for (const p of v.photos) {
      try {
        urls.push(await importPhoto(p, userId));
      } catch (e) {
        warnings.push(`фото ${p.slice(0, 60)}… — ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }
    if (urls.length) photos.set(i, urls);
  }
  const catId = await categoryId(input.category);
  const newSlug = prod ? null : await uniqueSlug(input.name!);
  const stockBefore = prod ? prod.variants.filter((v) => v.isActive).reduce((a, v) => a + v.stock, 0) : 0;
  // Цена товара = цена первого варианта. При обновлении меняем её, только если первый вариант есть в файле:
  // у остальных вариантов без своей цены она общая с товаром
  const current0 = prod?.variants[0];
  const baseRow = !prod || !current0 ? input.variants[0] : input.variants.find((v) => matchVariant(prod.variants, v, input.variants.length)?.id === current0.id);
  const basePrice = baseRow?.price ?? prod!.price;

  try {
    const productId = await db.transaction(async (tx) => {
      let id = prod?.id;
      const common = {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(catId ? { categoryId: catId } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.tags ? { searchTags: input.tags } : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.weight ? { weightGrams: input.weight } : {}),
        ...(input.length ? { lengthCm: input.length } : {}),
        ...(input.width ? { widthCm: input.width } : {}),
        ...(input.height ? { heightCm: input.height } : {}),
        ...(input.limited ? { isLimited: true, limitedTotal: input.limited } : {}),
        ...(input.videos ? { videos: input.videos } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.wholesalePrice != null ? { wholesalePrice: input.wholesalePrice || null } : {}),
        ...(input.wholesaleMin != null ? { wholesaleMin: input.wholesaleMin } : {}),
        price: basePrice,
        ...(baseRow && baseRow.oldPrice != null ? { oldPrice: baseRow.oldPrice > baseRow.price ? baseRow.oldPrice : null } : {}),
      };
      if (!id) {
        const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${s.product.sortOrder}), 0)::int` }).from(s.product);
        const [p] = await tx
          .insert(s.product)
          .values({
            name: input.name!.trim(),
            slug: newSlug!,
            sku,
            visibility: "DRAFT",
            sortOrder: max + 1,
            ...common,
          })
          .returning({ id: s.product.id });
        id = p.id;
      } else {
        await tx.update(s.product).set(common).where(eq(s.product.id, id));
      }

      const current = prod?.variants ?? [];
      let order = current.length;
      const variantIds: (string | null)[] = [];
      for (const v of input.variants) {
        const ev = matchVariant(current, v, input.variants.length);
        const row = {
          price: v.price === basePrice ? null : v.price,
          stock: v.stock,
          isActive: true,
          ...(v.name ? { name: v.name.trim() } : {}),
          ...(v.sku ? { sku: v.sku } : {}),
        };
        if (ev) {
          await tx.update(s.productVariant).set(row).where(eq(s.productVariant.id, ev.id));
          variantIds.push(ev.id);
        } else {
          const [nv] = await tx
            .insert(s.productVariant)
            .values({ productId: id, name: v.name?.trim() || "Основной", sortOrder: order++, ...row })
            .returning({ id: s.productVariant.id });
          variantIds.push(nv.id);
        }
      }

      // Характеристики: только те, что есть в файле; «-» — очистить
      for (const [attributeId, value] of Object.entries(input.attrs)) {
        if (value == null) {
          await tx.delete(s.productAttribute).where(and(eq(s.productAttribute.productId, id!), eq(s.productAttribute.attributeId, attributeId)));
        } else {
          await tx
            .insert(s.productAttribute)
            .values({ productId: id!, attributeId, value })
            .onConflictDoUpdate({ target: [s.productAttribute.productId, s.productAttribute.attributeId], set: { value } });
        }
      }

      // Фото: один вариант — фото товара целиком; несколько — фото своего варианта
      const totalVariants = Math.max(current.length, 0) + input.variants.filter((v) => !matchVariant(current, v, input.variants.length)).length;
      const single = totalVariants <= 1;
      for (const [i, urls] of photos) {
        const vid = single ? null : variantIds[i];
        if (single) await tx.delete(s.productImage).where(eq(s.productImage.productId, id));
        else await tx.delete(s.productImage).where(and(eq(s.productImage.productId, id), eq(s.productImage.variantId, vid!)));
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${s.productImage.sortOrder}), -1)::int` })
          .from(s.productImage)
          .where(eq(s.productImage.productId, id));
        await tx.insert(s.productImage).values(urls.map((url, k) => ({ productId: id!, url, alt: input.name ?? prod?.name ?? "", variantId: vid, sortOrder: max + 1 + k })));
      }
      return id;
    });
    const stockAfter = input.variants.reduce((a, v) => a + v.stock, 0);
    return { sku, ok: true, created: !prod, productId, warnings, backInStock: !!prod && stockBefore === 0 && stockAfter > 0 };
  } catch (e) {
    const text = e instanceof Error ? e.message + String((e as { cause?: unknown }).cause ?? "") : "";
    if (/unique|duplicate/i.test(text)) return { sku, ok: false, error: "артикул варианта уже есть у другого товара", warnings };
    console.error("[import]", e);
    return { sku, ok: false, error: "не сохранилось", warnings };
  }
}

// ---------- Шаблон и выгрузка

function attrNote(a: Attr) {
  if (a.type === "number") return `Число${a.unit ? ` в «${a.unit}»` : ""}. «-» — очистить.`;
  if (a.type === "select") return `Одно из: ${a.options.join(", ")}. «-» — очистить.`;
  return "Текст. «-» — очистить.";
}

function sheet(wb: ExcelJS.Workbook, attrs: Attr[]) {
  const ws = wb.addWorksheet("Товары", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    ...COLUMNS.map((c) => ({ header: c.title, key: c.key, width: c.width })),
    ...attrs.map((a) => ({ header: attrTitle(a), key: `attr:${a.id}`, width: Math.max(14, attrTitle(a).length * 0.9) })),
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FF0A0A0A" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCBF83" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
  COLUMNS.forEach((c, i) => {
    if (c.note) head.getCell(i + 1).note = c.note;
  });
  attrs.forEach((a, i) => {
    const cell = head.getCell(COLUMNS.length + i + 1);
    cell.note = attrNote(a);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9DDBF" } };
  });
  // Списки — выпадающим выбором
  attrs.forEach((a, i) => {
    if (a.type !== "select" || !a.options.length) return;
    const list = `"${["-", ...a.options].join(",")}"`;
    if (list.length > 255) return; // ограничение Excel на список
    const col = ws.getColumn(COLUMNS.length + i + 1).letter;
    (ws as unknown as { dataValidations: { add: (r: string, v: unknown) => void } }).dataValidations.add(`${col}2:${col}3001`, {
      type: "list",
      allowBlank: true,
      formulae: [list],
      showErrorMessage: false,
    });
  });
  const chCol = ws.getColumn(COLUMNS.findIndex((c) => c.key === "channel") + 1).letter;
  (ws as unknown as { dataValidations: { add: (r: string, v: unknown) => void } }).dataValidations.add(`${chCol}2:${chCol}3001`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Розница,Опт,Розница и опт"'],
    showErrorMessage: false,
  });
  return ws;
}

function howTo(wb: ExcelJS.Workbook, attrs: Attr[]) {
  const ws = wb.addWorksheet("Как заполнить");
  ws.columns = [
    { header: "Колонка", key: "c", width: 22 },
    { header: "Что писать", key: "n", width: 100 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of COLUMNS) ws.addRow({ c: c.title, n: c.note || "" });
  for (const a of attrs) ws.addRow({ c: attrTitle(a), n: attrNote(a) });
  ws.addRow({});
  const tips = [
    "Одна строка — один вариант товара. Если вариантов нет, на товар — одна строка.",
    "Строки с одинаковым «Артикулом товара» — варианты одного товара. Название, описание и категорию достаточно указать в первой строке.",
    "Обновление: выгрузите каталог из админки, поменяйте цены и остатки, загрузите файл обратно. Пустая ячейка — поле не меняется.",
    "Варианты, которых нет в файле, не удаляются. Удалить товар или вариант можно в карточке товара.",
    "Фото — прямые ссылки на картинки (заканчиваются на .jpg, .png, .webp) или ссылки Google Диска «Доступ: все, у кого есть ссылка».",
    "Новые товары создаются черновиками, если в «Показывать» не стоит «Да».",
    "Колонки «Характеристика: …» — для карточки товара, фильтров и подбора кия. Новые характеристики добавляются в админке → Каталог → Характеристики, потом скачайте шаблон заново.",
    "Пример: товар с вариантами",
  ];
  for (const t of tips) ws.addRow({ n: t });
  ws.addRow({});
  ws.addRow(COLUMNS.map((c) => c.title)).font = { bold: true };
  const examples = [
    ["CUE-PRED-01", "Кий Predator BK Rush", "Кии", "13 мм", "CUE-PRED-01-13", "45000", "", "2", "Да", "Разбойно-прыжковый кий…", "предатор, рыш", "https://example.com/cue-1.jpg"],
    ["CUE-PRED-01", "", "", "12,5 мм", "CUE-PRED-01-125", "45000", "", "1"],
    ["CHALK-KAMUI-098", "Мел Kamui 0.98", "Мел", "", "", "3500", "3900", "40", "Да", "", "камуи, джос"],
  ];
  for (const e of examples) ws.addRow(e).font = { color: { argb: "FF777777" } };
}

export async function templateXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Abramov Shop";
  const attrs = await listAttributes();
  sheet(wb, attrs);
  howTo(wb, attrs);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function exportXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Abramov Shop";
  const attrs = await listAttributes();
  const ws = sheet(wb, attrs);
  const values = new Map<string, Map<string, string>>();
  for (const r of await db.select().from(s.productAttribute)) {
    if (!values.has(r.productId)) values.set(r.productId, new Map());
    values.get(r.productId)!.set(r.attributeId, r.value);
  }
  const products = await db.query.product.findMany({
    orderBy: [asc(s.product.sortOrder), asc(s.product.name)],
    with: { category: true, variants: { orderBy: asc(s.productVariant.sortOrder) }, images: { orderBy: asc(s.productImage.sortOrder) } },
  });
  const VIS = { PUBLISHED: "Да", HIDDEN: "Нет", DRAFT: "Черновик" } as const;
  const abs = (u: string) => (u.startsWith("/") ? `${SITE.url}${u}` : u);
  for (const p of products) {
    const single = p.variants.length <= 1;
    p.variants.forEach((v, i) => {
      const imgs = single ? p.images : p.images.filter((im) => im.variantId === v.id);
      ws.addRow({
        productSku: p.sku || p.slug,
        name: i === 0 ? p.name : "",
        category: i === 0 ? (p.category?.name ?? "") : "",
        variant: single ? "" : v.name,
        variantSku: v.sku ?? "",
        price: (v.price ?? p.price) / 100,
        oldPrice: i === 0 && p.oldPrice ? p.oldPrice / 100 : "",
        stock: v.stock,
        visibility: i === 0 ? VIS[p.visibility] : "",
        description: i === 0 ? p.description : "",
        tags: i === 0 ? p.searchTags : "",
        photos: imgs.map((im) => abs(im.url)).join("\n"),
        weight: i === 0 ? p.weightGrams : "",
        length: i === 0 ? p.lengthCm : "",
        width: i === 0 ? p.widthCm : "",
        height: i === 0 ? p.heightCm : "",
        limited: i === 0 && p.isLimited && p.limitedTotal ? p.limitedTotal : "",
        videos: i === 0 ? p.videos.map((x) => (x.title ? `${x.url} | ${x.title}` : x.url)).join("\n") : "",
        channel: i === 0 ? CHANNEL_TEXT[p.channel as keyof typeof CHANNEL_TEXT] ?? "" : "",
        wholesalePrice: i === 0 && p.wholesalePrice ? p.wholesalePrice / 100 : "",
        wholesaleMin: i === 0 && p.channel !== "RETAIL" ? p.wholesaleMin : "",
        ...Object.fromEntries(attrs.map((a) => [`attr:${a.id}`, i === 0 ? (values.get(p.id)?.get(a.id)?.replace(".", a.type === "number" ? "," : ".") ?? "") : ""])),
      });
    });
  }
  howTo(wb, attrs);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
