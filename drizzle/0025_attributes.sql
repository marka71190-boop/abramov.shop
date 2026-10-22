CREATE TABLE "attribute" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"category_ids" text[] DEFAULT '{}' NOT NULL,
	"filterable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "product_attribute" (
	"product_id" text NOT NULL,
	"attribute_id" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "product_attribute_product_id_attribute_id_pk" PRIMARY KEY("product_id","attribute_id")
);
--> statement-breakpoint
ALTER TABLE "product_attribute" ADD CONSTRAINT "product_attribute_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute" ADD CONSTRAINT "product_attribute_attribute_id_attribute_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_attribute_attr_idx" ON "product_attribute" USING btree ("attribute_id");