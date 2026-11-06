CREATE TABLE "coach_application" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"city" text,
	"rank" text,
	"games" text[] DEFAULT '{}'::text[] NOT NULL,
	"coach_years" integer,
	"achievements" text,
	"about" text,
	"club_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_per_hour" integer,
	"links" text,
	"clubs_only_accepted" boolean DEFAULT false NOT NULL,
	"reply" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_application" ADD CONSTRAINT "coach_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_application" ADD CONSTRAINT "coach_application_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_application_status_idx" ON "coach_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coach_application_user_idx" ON "coach_application" USING btree ("user_id");