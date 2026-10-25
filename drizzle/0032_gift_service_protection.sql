ALTER TABLE "gift_card" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_request" ADD COLUMN "old_payment_ids" text[] DEFAULT '{}' NOT NULL;