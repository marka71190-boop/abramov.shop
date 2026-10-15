CREATE TABLE "saved_cart" (
	"user_id" text PRIMARY KEY NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	"remind_count" integer DEFAULT 0 NOT NULL,
	"recovered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "saved_cart" ADD CONSTRAINT "saved_cart_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_cart_updated_idx" ON "saved_cart" USING btree ("updated_at");