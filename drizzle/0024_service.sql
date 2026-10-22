CREATE TYPE "public"."service_status" AS ENUM('NEW', 'RECEIVED', 'IN_WORK', 'READY', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "service_event" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"status" "service_status" NOT NULL,
	"note" text,
	"photo" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_item" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"price_from" boolean DEFAULT false NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_request" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"handover" text NOT NULL,
	"club_id" text,
	"return_method" text NOT NULL,
	"return_address" text,
	"status" "service_status" DEFAULT 'NEW' NOT NULL,
	"price" integer,
	"ready_by" timestamp with time zone,
	"payment_id" text,
	"payment_status" text,
	"pay_url" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_request_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "service_event" ADD CONSTRAINT "service_event_request_id_service_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_event" ADD CONSTRAINT "service_event_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_event_request_idx" ON "service_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "service_request_status_idx" ON "service_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_request_user_idx" ON "service_request" USING btree ("user_id");