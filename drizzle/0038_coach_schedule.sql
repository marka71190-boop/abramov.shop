ALTER TYPE "public"."training_booking_status" ADD VALUE 'REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."training_booking_status" ADD VALUE 'DECLINED';--> statement-breakpoint
CREATE TABLE "coach_day_off" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"day" date NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"club_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_booking" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "price_per_hour" integer DEFAULT 300000 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "durations" integer[] DEFAULT '{60,90,120}' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "step_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "lead_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "horizon_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "auto_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_booking" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "training_booking" ADD COLUMN "guest_phone" text;--> statement-breakpoint
ALTER TABLE "training_booking" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "training_slot" ADD COLUMN "source" text DEFAULT 'PUBLISHED' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_slot" ADD COLUMN "diary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "patronymic" text;--> statement-breakpoint
ALTER TABLE "coach_day_off" ADD CONSTRAINT "coach_day_off_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_hours" ADD CONSTRAINT "coach_hours_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_hours" ADD CONSTRAINT "coach_hours_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_day_off_uq" ON "coach_day_off" USING btree ("coach_id","day");--> statement-breakpoint
CREATE INDEX "coach_hours_coach_idx" ON "coach_hours" USING btree ("coach_id","weekday");