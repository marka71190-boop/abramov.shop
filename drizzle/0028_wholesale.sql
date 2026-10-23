CREATE TYPE "public"."org_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"inn" text NOT NULL,
	"kpp" text,
	"ogrn" text,
	"name" text NOT NULL,
	"legal_address" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"tables" integer,
	"city" text DEFAULT '' NOT NULL,
	"website" text,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text NOT NULL,
	"comment" text,
	"status" "org_status" DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_inn_unique" UNIQUE("inn")
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_method" text DEFAULT 'ONLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "wholesale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "channel" text DEFAULT 'RETAIL' NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "wholesale_price" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "wholesale_min" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "organization_id" text;--> statement-breakpoint
CREATE INDEX "organization_status_idx" ON "organization" USING btree ("status");