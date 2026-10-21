CREATE TABLE "cue_showcase" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"cue_key" text,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "cue_key" text;--> statement-breakpoint
ALTER TABLE "cue_showcase" ADD CONSTRAINT "cue_showcase_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;