ALTER TABLE "product" ADD COLUMN "old_sku" text;--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "old_sku" text;--> statement-breakpoint
-- Артикул = штрихкод. 1) У кого нет штрихкода — выдаём магазинный EAN-13: 200 + номер + контрольная цифра
WITH base AS (
  SELECT coalesce(max(substr(barcode, 4, 9)::bigint), 0) AS n FROM product_variant WHERE barcode ~ '^200[0-9]{10}$'
), todo AS (
  SELECT id, row_number() OVER (ORDER BY product_id, sort_order, id) AS rn FROM product_variant WHERE barcode IS NULL
), num AS (
  SELECT todo.id, '200' || lpad((base.n + todo.rn)::text, 9, '0') AS d12 FROM todo, base
)
UPDATE product_variant v
SET barcode = num.d12 || ((10 - (SELECT sum(substr(num.d12, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END) FROM generate_series(1, 12) AS i) % 10) % 10)::text
FROM num WHERE v.id = num.id;
--> statement-breakpoint
-- 2) Прежний артикул сохраняем — по нему найдутся старые этикетки и файлы Excel
UPDATE product_variant SET old_sku = sku WHERE sku IS NOT NULL AND sku <> barcode AND old_sku IS NULL;
--> statement-breakpoint
UPDATE product_variant SET sku = NULL WHERE sku IS DISTINCT FROM barcode;
--> statement-breakpoint
UPDATE product_variant SET sku = barcode WHERE sku IS NULL;
--> statement-breakpoint
-- 3) Товар с одним вариантом: артикул товара = штрихкод варианта (его показывают в каталоге, файлах и накладных)
UPDATE product p SET old_sku = p.sku
WHERE p.sku IS NOT NULL AND p.old_sku IS NULL
  AND (SELECT count(*) FROM product_variant v WHERE v.product_id = p.id AND v.is_active) = 1
  AND p.sku <> (SELECT v.barcode FROM product_variant v WHERE v.product_id = p.id AND v.is_active LIMIT 1);
--> statement-breakpoint
UPDATE product p SET sku = (SELECT v.barcode FROM product_variant v WHERE v.product_id = p.id AND v.is_active LIMIT 1)
WHERE (SELECT count(*) FROM product_variant v WHERE v.product_id = p.id AND v.is_active) = 1;
