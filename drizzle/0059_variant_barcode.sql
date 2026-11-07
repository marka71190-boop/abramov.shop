ALTER TABLE "product_variant" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_barcode_unique" UNIQUE("barcode");