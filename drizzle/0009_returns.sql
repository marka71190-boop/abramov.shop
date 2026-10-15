CREATE TYPE "public"."return_kind" AS ENUM('QUALITY', 'DEFECT');--> statement-breakpoint
CREATE TYPE "public"."return_resolution" AS ENUM('REFUND', 'EXCHANGE', 'DISCOUNT');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('NEW', 'APPROVED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "return_item" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_request" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text,
	"kind" "return_kind" NOT NULL,
	"resolution" "return_resolution" DEFAULT 'REFUND' NOT NULL,
	"reason" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"status" "return_status" DEFAULT 'NEW' NOT NULL,
	"decision_due" timestamp with time zone NOT NULL,
	"answer" text,
	"refund_amount" integer,
	"bonus_returned" integer,
	"restocked" boolean DEFAULT false NOT NULL,
	"handled_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"due_reminder_at" timestamp with time zone,
	CONSTRAINT "return_request_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "return_item" ADD CONSTRAINT "return_item_request_id_return_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."return_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_item" ADD CONSTRAINT "return_item_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_handled_by_id_user_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_request_status_idx" ON "return_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "return_request_order_idx" ON "return_request" USING btree ("order_id");