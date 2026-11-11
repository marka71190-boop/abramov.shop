CREATE TYPE "public"."cue_passport_status" AS ENUM('ACTIVE', 'VOID');--> statement-breakpoint
CREATE TABLE "cue_passport" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"serial" text NOT NULL,
	"claim_code" text NOT NULL,
	"model" text NOT NULL,
	"spec" text,
	"master" text,
	"made_at" timestamp with time zone NOT NULL,
	"warranty_months" integer DEFAULT 12 NOT NULL,
	"photo" text,
	"status" "cue_passport_status" DEFAULT 'ACTIVE' NOT NULL,
	"owner_id" text,
	"order_id" text,
	"order_item_id" text,
	"transfer_token" text,
	"transfer_until" timestamp with time zone,
	"scans" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cue_passport_code_unique" UNIQUE("code"),
	CONSTRAINT "cue_passport_serial_unique" UNIQUE("serial")
);
--> statement-breakpoint
CREATE TABLE "cue_passport_event" (
	"id" text PRIMARY KEY NOT NULL,
	"passport_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"service_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cue_passport" ADD CONSTRAINT "cue_passport_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cue_passport" ADD CONSTRAINT "cue_passport_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cue_passport" ADD CONSTRAINT "cue_passport_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cue_passport_event" ADD CONSTRAINT "cue_passport_event_passport_id_cue_passport_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."cue_passport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cue_passport_event" ADD CONSTRAINT "cue_passport_event_service_request_id_service_request_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cue_passport_owner_idx" ON "cue_passport" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "cue_passport_order_idx" ON "cue_passport" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cue_passport_event_passport_idx" ON "cue_passport_event" USING btree ("passport_id");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "cue_passport_seq";
