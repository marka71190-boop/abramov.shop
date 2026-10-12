ALTER TABLE "user" ADD COLUMN "birthday_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "birthday_bonus_year" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bonus_reminder_at" timestamp with time zone;