CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cdek_city_code" integer;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "delivery_tariff" integer;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "delivery_days" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cdek_status" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bonus_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "confirmation_url" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;