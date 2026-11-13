CREATE TABLE "staff_pay" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"month" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_rate" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"percent" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_pay" ADD CONSTRAINT "staff_pay_by_id_user_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_pay_month_idx" ON "staff_pay" USING btree ("month","key");