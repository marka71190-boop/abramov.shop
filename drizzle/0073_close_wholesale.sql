-- Опт закрыт по просьбе владельца: выключаем приём заявок и оптовые цены (включить обратно — в настройках админки)
UPDATE "setting" SET "value" = jsonb_set("value", '{b2b,enabled}', 'false'::jsonb, true) WHERE "key" = 'site' AND "value" ? 'b2b';
