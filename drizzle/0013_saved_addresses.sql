ALTER TABLE "address" ADD COLUMN "delivery_type" text DEFAULT 'PVZ' NOT NULL;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "cdek_city_code" integer;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "recipient_phone" text;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "address_user_idx" ON "address" USING btree ("user_id");