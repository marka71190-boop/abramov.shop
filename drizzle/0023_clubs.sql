CREATE TABLE "club" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"work_time" text DEFAULT '' NOT NULL,
	"phone" text,
	"note" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"pickup" boolean DEFAULT true NOT NULL,
	"service" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "pickup_club_id" text;