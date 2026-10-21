CREATE TYPE "public"."production_stage" AS ENUM('ACCEPTED', 'IN_WORK', 'READY');--> statement-breakpoint
CREATE TABLE "production_event" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"stage" "production_stage" NOT NULL,
	"note" text,
	"photo" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_event" ADD CONSTRAINT "production_event_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_event" ADD CONSTRAINT "production_event_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_event_order_idx" ON "production_event" USING btree ("order_id");