/** Галерея готовых киёв «Чемпион» */
import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { cueKey, parseCueKey, resolveCue } from "@/lib/cue-config";
import { getCueConfig } from "@/lib/cue";

/** Опубликованные работы с ценой «такого же» по текущему прайсу (если сборку ещё можно повторить) */
export async function publicShowcase() {
  const [rows, cfg] = await Promise.all([
    db.query.cueShowcase.findMany({ where: eq(s.cueShowcase.published, true), orderBy: [asc(s.cueShowcase.sortOrder), desc(s.cueShowcase.createdAt)], limit: 24 }),
    getCueConfig(),
  ]);
  return rows
    .filter((r) => r.photos.length > 0)
    .map((r) => {
      const sel = r.cueKey ? parseCueKey(r.cueKey) : null;
      const res = sel ? resolveCue(cfg, sel) : null;
      const ok = res && typeof res !== "string";
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        photos: r.photos,
        key: ok ? cueKey(sel!) : null,
        price: ok ? res.price : null,
        summary: ok ? res.summary : null,
        spec: ok ? res.spec.map((x) => `${x.group}: ${x.value}`) : [],
      };
    });
}

/** Новая работа из заказа: сборка без гравировки и фото с этапов изготовления */
export async function showcaseFromOrder(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true } });
  const item = o?.items.find((i) => i.spec);
  if (!o || !item) return null;
  const existing = await db.query.cueShowcase.findFirst({ where: and(eq(s.cueShowcase.orderId, orderId), isNotNull(s.cueShowcase.orderId)) });
  if (existing) return existing.id;
  const photos = (
    await db
      .select({ photo: s.productionEvent.photo })
      .from(s.productionEvent)
      .where(and(eq(s.productionEvent.orderId, orderId), isNotNull(s.productionEvent.photo)))
      .orderBy(desc(s.productionEvent.createdAt))
  )
    .map((r) => r.photo!)
    .slice(0, 8);
  const title = item.name.replace(/^Кий «Чемпион» · /, "Чемпион · ");
  const [row] = await db
    .insert(s.cueShowcase)
    .values({ title: title.slice(0, 120), photos, cueKey: item.cueKey, orderId, published: false })
    .returning({ id: s.cueShowcase.id });
  return row.id;
}
