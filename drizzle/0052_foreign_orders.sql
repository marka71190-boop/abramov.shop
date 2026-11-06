ALTER TABLE "address" ADD COLUMN "country" text DEFAULT 'RU' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "country" text DEFAULT 'RU' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "country_name" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "foreign_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "foreign_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "country" text DEFAULT 'RU' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "country_name" text;