ALTER TYPE "public"."bonus_reason" ADD VALUE 'REVIEW';--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "admin_reply" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "moderated_by_id" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "bonus_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_user_product_idx" ON "review" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "review_status_idx" ON "review" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_sub_user_product_idx" ON "stock_subscription" USING btree ("product_id","user_id");