ALTER TABLE "club_stock" ADD COLUMN "min_qty" integer;--> statement-breakpoint
ALTER TABLE "club_stock" ADD COLUMN "low_notified_at" timestamp with time zone;UPDATE "club_stock" SET "low_notified_at" = now() WHERE "qty" <= 0;
