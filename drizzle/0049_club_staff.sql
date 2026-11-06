ALTER TABLE "pos_sale" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "club_ids" text[] DEFAULT '{}'::text[] NOT NULL;