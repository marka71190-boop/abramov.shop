ALTER TABLE "promo_code" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "saved_cart" ADD COLUMN "promo_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;