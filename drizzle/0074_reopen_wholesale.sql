-- Откат «Опт закрыт» (обновление было для другого сайта): включаем опт обратно, как было до 0073
UPDATE "setting" SET "value" = jsonb_set("value", '{b2b,enabled}', 'true'::jsonb, true) WHERE "key" = 'site' AND "value" ? 'b2b';
