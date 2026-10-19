"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { CUE_GROUPS, mergeCue, visibleGroups, visibleOptions, type CueConfig } from "@/lib/cue-config";
import { cueProduct, saveCueConfig } from "@/lib/cue";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

const kop = z.coerce
  .number({ message: "Цена — числом" })
  .min(0, "Цена не может быть меньше нуля")
  .max(10_000_000, "Слишком большая цена")
  .transform((r) => Math.round(r * 100));

const Option = z.object({
  id: z.string().regex(/^[a-z0-9]{1,8}$/),
  name: z.string().trim().min(1, "У варианта нет названия").max(60, "Название варианта — до 60 символов"),
  price: kop,
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  hidden: z.boolean().optional(),
});

const Group = z.object({
  id: z.enum(CUE_GROUPS.map((g) => g.id) as [string, ...string[]]),
  title: z.string().trim().min(1, "У раздела нет названия").max(60),
  help: z.string().trim().max(200).optional(),
  hidden: z.boolean().optional(),
  options: z.array(Option).max(30, "В разделе — до 30 вариантов"),
  price: kop.optional(),
  maxLength: z.coerce.number().int().min(1).max(60).optional(),
});

const Config = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2, "Укажите заголовок").max(120),
  intro: z.string().trim().max(600),
  basePrice: kop.refine((k) => k >= 100, "Базовая цена — от 1 ₽"),
  leadDays: z.coerce.number().int().min(1, "Срок — от 1 дня").max(365),
  groups: z.array(Group).length(CUE_GROUPS.length),
});

export async function saveCueAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("config") ?? ""));
  } catch {
    return { error: "Не удалось прочитать форму" };
  }
  const p = Config.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const cfg = mergeCue(p.data) as CueConfig;
  for (const g of cfg.groups) {
    const ids = g.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) return { error: `«${g.title}»: повторяются варианты — обновите страницу` };
  }
  if (cfg.enabled) {
    const empty = cfg.groups.find((g) => !g.hidden && g.id !== "e" && !visibleOptions(g).length);
    if (empty) return { error: `Нельзя включить: в разделе «${empty.title}» нет ни одного варианта. Добавьте вариант или скройте раздел` };
    if (!visibleGroups(cfg).some((g) => g.id === "b")) return { error: "Нельзя включить: скрыт выбор турняка" };
  }
  await saveCueConfig(cfg);
  await cueProduct(); // служебный товар для заказов
  await audit(me.id, "cue.update", "setting", "cue", { enabled: cfg.enabled, basePrice: cfg.basePrice });
  revalidatePath("/", "layout");
  return { ok: cfg.enabled ? "Сохранено — конструктор открыт покупателям" : "Сохранено. Конструктор выключен — покупатели его не видят" };
}
