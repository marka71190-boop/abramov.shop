CREATE TABLE "coach_agreement" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"version" text NOT NULL,
	"full_name" text NOT NULL,
	"tax_status" text NOT NULL,
	"inn" text,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"body" text NOT NULL,
	"sha256" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"signed_at" timestamp with time zone,
	"sign_ip" text,
	"sign_user_agent" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_agreement" ADD CONSTRAINT "coach_agreement_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_agreement_coach_idx" ON "coach_agreement" USING btree ("coach_id");