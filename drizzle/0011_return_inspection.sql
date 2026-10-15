ALTER TABLE "return_request" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_request" ADD COLUMN "inspection_due" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_request" ADD COLUMN "inspection_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_request" ADD COLUMN "conclusion" text;