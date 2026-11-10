-- «Основной» (вариант, который сайт создаёт сам) рядом с настоящими вариантами покупателю не нужен:
-- выключаем (без lower(): на базе с локалью C он не понимает кириллицу), если он пустой — нет остатка ни на складе, ни в клубах
UPDATE "product_variant" v SET "is_active" = false
WHERE v."is_active"
  AND trim(v."name") IN ('Основной', 'основной', 'ОСНОВНОЙ', 'Основной вариант', 'основной вариант')
  AND v."stock" <= 0
  AND NOT EXISTS (SELECT 1 FROM "club_stock" cs WHERE cs."variant_id" = v."id" AND cs."qty" > 0)
  AND EXISTS (
    SELECT 1 FROM "product_variant" o
    WHERE o."product_id" = v."product_id" AND o."id" <> v."id" AND o."is_active"
      AND trim(o."name") NOT IN ('Основной', 'основной', 'ОСНОВНОЙ', 'Основной вариант', 'основной вариант')
  );
