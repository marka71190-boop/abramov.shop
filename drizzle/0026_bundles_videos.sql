CREATE TABLE "bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"product_ids" text[] DEFAULT '{}' NOT NULL,
	"percent" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bundle_discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;