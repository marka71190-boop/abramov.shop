CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SENDING', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"promo_code_id" text,
	"button_text" text,
	"button_url" text,
	"channel_email" boolean DEFAULT true NOT NULL,
	"channel_telegram" boolean DEFAULT false NOT NULL,
	"only_verified" boolean DEFAULT false NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipient_uniq" ON "campaign_recipient" USING btree ("campaign_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "campaign_recipient_status_idx" ON "campaign_recipient" USING btree ("status","channel");