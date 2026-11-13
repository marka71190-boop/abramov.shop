CREATE TABLE "supplier_card" (
	"product_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"url" text,
	"code" text,
	"title" text,
	"score" integer DEFAULT 0 NOT NULL,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rrp" integer,
	"note" text,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_card" ADD CONSTRAINT "supplier_card_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;