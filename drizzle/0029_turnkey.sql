CREATE TABLE "turnkey_request" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"comment" text,
	"plan" jsonb NOT NULL,
	"tables" jsonb NOT NULL,
	"models" jsonb NOT NULL,
	"estimate" jsonb NOT NULL,
	"area" integer NOT NULL,
	"table_count" integer NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnkey_request_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "turnkey_request" ADD CONSTRAINT "turnkey_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turnkey_request_status_idx" ON "turnkey_request" USING btree ("status");