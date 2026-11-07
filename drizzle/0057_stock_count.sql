CREATE TABLE "stock_count" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"full" boolean DEFAULT true NOT NULL,
	"staff_name" text,
	"note" text,
	"created_by_id" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_by_id" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_applied_by_id_user_id_fk" FOREIGN KEY ("applied_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_count_club_idx" ON "stock_count" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "stock_count_status_idx" ON "stock_count" USING btree ("status");