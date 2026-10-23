/**
 * Товарный фид в формате YML (Яндекс): Яндекс Товары, Яндекс Бизнес, Директ (товарные кампании).
 * Только опубликованные товары и категории; каждый вариант — отдельное предложение,
 * варианты одного товара связаны group_id. Персональных данных в фиде нет.
 */
import "server-only";
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { shareImage } from "@/lib/seo";
import { SELLER, SITE } from "@/lib/site";
import { isPublic, isRetail } from "@/lib/visibility";

const xml = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
/** Стабильный числовой id (категории, группы) — из uuid */
const num = (id: string) => String(parseInt(createHash("sha1").update(id).digest("hex").slice(0, 12), 16));
/** id предложения: латиница и цифры, до 20 символов */
const offerId = (v: { id: string; sku: string | null }) => (v.sku && /^[A-Za-z0-9]{1,20}$/.test(v.sku) ? v.sku : v.id.replace(/-/g, "").slice(0, 20));
const rub = (kop: number) => (kop / 100).toFixed(kop % 100 ? 2 : 0);
const plain = (t: string) =>
  t
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2900);

export async function yandexFeed() {
  const [cats, products] = await Promise.all([
    db.query.category.findMany({ orderBy: asc(s.category.sortOrder) }),
    db.query.product.findMany({
      orderBy: asc(s.product.sortOrder),
      with: { variants: { orderBy: asc(s.productVariant.sortOrder) }, images: { orderBy: asc(s.productImage.sortOrder) } },
    }),
  ]);
  const publicCats = cats.filter((c) => isPublic(c));
  const catIds = new Set(publicCats.map((c) => c.id));
  const date = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16) + "+03:00";

  // Характеристики → <param>, бренд → <vendor>
  const { listAttributes, attrValues } = await import("@/lib/attributes");
  const [attrDefs, attrVals] = await Promise.all([listAttributes(), attrValues(products.map((p) => p.id))]);
  const pickupOn = (await (await import("@/lib/settings")).getSettings()).delivery.pickupEnabled && (await db.$count(s.club, eq(s.club.pickup, true))) > 0;

  const offers: string[] = [];
  for (const p of products) {
    if (!isRetail(p) || (p.categoryId && !catIds.has(p.categoryId))) continue;
    const variants = p.variants.filter((v) => v.isActive);
    const many = variants.length > 1;
    for (const v of variants) {
      const price = v.price ?? p.price;
      const pics = [...p.images.filter((i) => i.variantId === v.id), ...p.images.filter((i) => !i.variantId)]
        .map((i) => shareImage(i.url))
        .filter((u): u is string => !!u)
        .slice(0, 10);
      const url = `${SITE.url}/product/${p.slug}${many ? `?v=${v.id}` : ""}`;
      offers.push(
        [
          `<offer id="${xml(offerId(v))}" available="${v.stock > 0}"${many ? ` group_id="${num(p.id)}"` : ""}>`,
          `<name>${xml(many ? `${p.name}, ${v.name}` : p.name)}</name>`,
          `<url>${xml(url)}</url>`,
          `<price>${rub(price)}</price>`,
          p.oldPrice && p.oldPrice > price ? `<oldprice>${rub(p.oldPrice)}</oldprice>` : "",
          `<currencyId>RUR</currencyId>`,
          p.categoryId ? `<categoryId>${num(p.categoryId)}</categoryId>` : "",
          ...pics.map((u) => `<picture>${xml(u)}</picture>`),
          `<delivery>true</delivery>`,
          `<pickup>${pickupOn}</pickup>`,
          (() => {
            const brand = attrDefs.find((a) => a.key === "brand");
            const b = brand ? attrVals.get(p.id)?.get(brand.id) : undefined;
            return b ? `<vendor>${xml(b)}</vendor>` : "";
          })(),
          p.description ? `<description><![CDATA[${plain(p.description).replace(/]]>/g, "]]&gt;")}]]></description>` : "",
          v.sku || p.sku ? `<vendorCode>${xml((v.sku || p.sku)!)}</vendorCode>` : "",
          many ? `<param name="Вариант">${xml(v.name)}</param>` : "",
          ...attrDefs
            .filter((a) => a.key !== "brand" && attrVals.get(p.id)?.has(a.id))
            .map((a) => `<param name="${xml(a.name)}"${a.unit ? ` unit="${xml(a.unit)}"` : ""}>${xml(attrVals.get(p.id)!.get(a.id)!)}</param>`),
          `<count>${Math.max(0, v.stock)}</count>`,
          `<weight>${(p.weightGrams / 1000).toFixed(3)}</weight>`,
          `<dimensions>${p.lengthCm}/${p.widthCm}/${p.heightCm}</dimensions>`,
          `</offer>`,
        ]
          .filter(Boolean)
          .join(""),
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date}">
<shop>
<name>${xml(SITE.name)}</name>
<company>${xml(SELLER.name)}</company>
<url>${xml(SITE.url)}</url>
<currencies><currency id="RUR" rate="1"/></currencies>
<categories>
${publicCats.map((c) => `<category id="${num(c.id)}"${c.parentId && catIds.has(c.parentId) ? ` parentId="${num(c.parentId)}"` : ""}>${xml(c.name)}</category>`).join("\n")}
</categories>
<offers>
${offers.join("\n")}
</offers>
</shop>
</yml_catalog>
`;
}
