CREATE TABLE "club_stock" (
	"club_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_stock_club_id_variant_id_pk" PRIMARY KEY("club_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "pos_cash_move" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"user_id" text,
	"staff_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_return" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"sale_id" text NOT NULL,
	"shift_id" text,
	"seller_id" text,
	"approver_id" text,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"bonus_back" integer DEFAULT 0 NOT NULL,
	"accrued_back" integer DEFAULT 0 NOT NULL,
	"refund_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_return_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "pos_return_item" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"sale_item_id" text,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bonus_transaction" ADD COLUMN "pos_sale_id" text;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "own_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "stock_club_id" text;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "bonus_spent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "bonus_accrued" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "bonus_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "refunded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "discount_by_id" text;--> statement-breakpoint
ALTER TABLE "pos_sale_item" ADD COLUMN "returned_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD COLUMN "cash_moves" integer;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD COLUMN "cash_refunds" integer;--> statement-breakpoint
ALTER TABLE "pos_shift" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pin_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pin_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pin_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_stock" ADD CONSTRAINT "club_stock_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_stock" ADD CONSTRAINT "club_stock_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_cash_move" ADD CONSTRAINT "pos_cash_move_shift_id_pos_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."pos_shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_cash_move" ADD CONSTRAINT "pos_cash_move_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return" ADD CONSTRAINT "pos_return_sale_id_pos_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return" ADD CONSTRAINT "pos_return_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return" ADD CONSTRAINT "pos_return_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return_item" ADD CONSTRAINT "pos_return_item_return_id_pos_return_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."pos_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_return_item" ADD CONSTRAINT "pos_return_item_sale_item_id_pos_sale_item_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."pos_sale_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_stock_variant_idx" ON "club_stock" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "pos_cash_move_shift_idx" ON "pos_cash_move" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "pos_return_sale_idx" ON "pos_return" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pos_return_created_idx" ON "pos_return" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;