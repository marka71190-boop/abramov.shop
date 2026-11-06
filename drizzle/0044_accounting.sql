CREATE TABLE "expense" (
	"id" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_sale" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"method" text NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"payment_id" text,
	"qr_url" text,
	"place" text,
	"seller_id" text,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_sale_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "pos_sale_item" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" integer
);
--> statement-breakpoint
CREATE TABLE "stock_move" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text,
	"product_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" integer,
	"stock_after" integer,
	"note" text,
	"pos_sale_id" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "delivery_cost" integer;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "unit_cost" integer;--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "cost_price" integer;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_item" ADD CONSTRAINT "pos_sale_item_sale_id_pos_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_item" ADD CONSTRAINT "pos_sale_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_item" ADD CONSTRAINT "pos_sale_item_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_day_idx" ON "expense" USING btree ("day");--> statement-breakpoint
CREATE INDEX "pos_sale_status_idx" ON "pos_sale" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pos_sale_paid_idx" ON "pos_sale" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "stock_move_variant_idx" ON "stock_move" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_move_created_idx" ON "stock_move" USING btree ("created_at");