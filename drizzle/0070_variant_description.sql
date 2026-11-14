ALTER TABLE "product_variant" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_card" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;