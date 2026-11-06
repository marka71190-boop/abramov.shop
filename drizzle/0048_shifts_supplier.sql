CREATE TABLE "pos_shift" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"place" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"opening_cash" integer DEFAULT 0 NOT NULL,
	"cash_sales" integer,
	"other_sales" integer,
	"expected_cash" integer,
	"counted_cash" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" text
);
--> statement-breakpoint
CREATE TABLE "supplier_order" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ordered_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	CONSTRAINT "supplier_order_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "supplier_order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"variant_id" text,
	"product_id" text,
	"name" text NOT NULL,
	"sku" text,
	"qty" integer NOT NULL,
	"unit_cost" integer,
	"received_qty" integer
);
--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "shift_id" text;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD CONSTRAINT "pos_shift_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD CONSTRAINT "pos_shift_closed_by_id_user_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_item" ADD CONSTRAINT "supplier_order_item_order_id_supplier_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."supplier_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_item" ADD CONSTRAINT "supplier_order_item_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_item" ADD CONSTRAINT "supplier_order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_shift_seller_idx" ON "pos_shift" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_shift_one_open" ON "pos_shift" USING btree ("seller_id") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX "supplier_order_status_idx" ON "supplier_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pos_sale_shift_idx" ON "pos_sale" USING btree ("shift_id");