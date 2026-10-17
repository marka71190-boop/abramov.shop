CREATE TABLE "product_related" (
	"product_id" text NOT NULL,
	"related_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_related_product_id_related_id_pk" PRIMARY KEY("product_id","related_id")
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_related" ADD CONSTRAINT "product_related_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_related" ADD CONSTRAINT "product_related_related_id_product_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;