ALTER TABLE "gift_card_use" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_card" ADD COLUMN "pos_sale_id" text;--> statement-breakpoint
ALTER TABLE "gift_card_use" ADD COLUMN "pos_sale_id" text;--> statement-breakpoint
ALTER TABLE "pos_return" ADD COLUMN "gift_back" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "kind" text DEFAULT 'SALE' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sale" ADD COLUMN "gift_card_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_card_use" ADD CONSTRAINT "gift_card_use_pos_sale_id_pos_sale_id_fk" FOREIGN KEY ("pos_sale_id") REFERENCES "public"."pos_sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_use_pos_idx" ON "gift_card_use" USING btree ("pos_sale_id");