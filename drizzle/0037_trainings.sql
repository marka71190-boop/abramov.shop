CREATE TYPE "public"."training_booking_status" AS ENUM('BOOKED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."training_slot_status" AS ENUM('OPEN', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'COACH';--> statement-breakpoint
CREATE TABLE "coach_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"photo" text,
	"title" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"games" text DEFAULT 'Русский бильярд' NOT NULL,
	"club_ids" text[] DEFAULT '{}' NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_profile_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "training_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "training_booking_status" DEFAULT 'BOOKED' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"cancelled_by" text,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_slot" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"club_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"kind" text DEFAULT 'INDIVIDUAL' NOT NULL,
	"title" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "training_slot_status" DEFAULT 'OPEN' NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_booking" ADD CONSTRAINT "training_booking_slot_id_training_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."training_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_booking" ADD CONSTRAINT "training_booking_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_slot" ADD CONSTRAINT "training_slot_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_slot" ADD CONSTRAINT "training_slot_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_booking_slot_idx" ON "training_booking" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "training_booking_user_idx" ON "training_booking" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_booking_active_uq" ON "training_booking" USING btree ("slot_id","user_id") WHERE "training_booking"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "training_slot_start_idx" ON "training_slot" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "training_slot_coach_idx" ON "training_slot" USING btree ("coach_id","starts_at");