ALTER TABLE "product_variant" ADD COLUMN "supplier_code" text;--> statement-breakpoint
ALTER TABLE "supplier_order_item" ADD COLUMN "supplier_code" text;--> statement-breakpoint
-- Коды «Фортуны», которые уже нашлись: товару с одним вариантом — код его карточки поставщика
UPDATE "product_variant" v SET "supplier_code" = sc."code"
FROM "supplier_card" sc
WHERE sc."product_id" = v."product_id" AND sc."code" IS NOT NULL AND sc."status" IN ('FOUND', 'APPLIED') AND v."supplier_code" IS NULL
  AND (SELECT count(*) FROM "product_variant" v2 WHERE v2."product_id" = v."product_id" AND v2."is_active") = 1;
