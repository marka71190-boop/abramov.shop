ALTER TABLE "order" ADD COLUMN "recipient_tin" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "hs_code" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "origin_country" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tin" text;--> statement-breakpoint
-- Узбекистан убран из стран СДЭК (если список уже сохраняли в настройках)
UPDATE "setting" SET "value" = jsonb_set("value", '{foreign,cdekCountries}', to_jsonb(trim(both E'\n' from regexp_replace("value"->'foreign'->>'cdekCountries', '(^|\n)UZ [^\n]*', '', 'g')))) WHERE "key" = 'site' AND "value"->'foreign' ? 'cdekCountries';
