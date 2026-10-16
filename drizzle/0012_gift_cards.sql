CREATE TYPE "public"."gift_card_status" AS ENUM('PENDING', 'ACTIVE', 'VOID');--> statement-breakpoint
CREATE TABLE "gift_card" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"token" text NOT NULL,
	"status" "gift_card_status" DEFAULT 'PENDING' NOT NULL,
	"source" text NOT NULL,
	"initial_amount" integer NOT NULL,
	"balance" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"buyer_id" text,
	"buyer_email" text,
	"recipient_name" text,
	"recipient_email" text,
	"sender_name" text,
	"message" text,
	"send_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"payment_id" text,
	"payment_status" "payment_status",
	"confirmation_url" text,
	"paid_at" timestamp with time zone,
	"pay_expires_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_card_code_unique" UNIQUE("code"),
	CONSTRAINT "gift_card_token_unique" UNIQUE("token"),
	CONSTRAINT "gift_card_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "gift_card_use" (
	"id" text PRIMARY KEY NOT NULL,
	"gift_card_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reversed_at" timestamp with time zone,
	"receipt_id" text,
	"receipt_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "gift_card_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_use" ADD CONSTRAINT "gift_card_use_gift_card_id_gift_card_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_use" ADD CONSTRAINT "gift_card_use_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_buyer_idx" ON "gift_card" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "gift_card_status_idx" ON "gift_card" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gift_card_use_card_idx" ON "gift_card_use" USING btree ("gift_card_id");--> statement-breakpoint
CREATE INDEX "gift_card_use_order_idx" ON "gift_card_use" USING btree ("order_id");