CREATE TYPE "public"."banner_place" AS ENUM('HOME', 'STRIP');--> statement-breakpoint
CREATE TABLE "banner" (
	"id" text PRIMARY KEY NOT NULL,
	"place" "banner_place" DEFAULT 'HOME' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"image" text,
	"image_mobile" text,
	"button_text" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'dark' NOT NULL,
	"countdown" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "banner_place_idx" ON "banner" USING btree ("place","sort_order");