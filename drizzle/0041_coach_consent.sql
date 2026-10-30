ALTER TYPE "public"."consent_kind" ADD VALUE 'COACH_TRANSFER';--> statement-breakpoint
ALTER TYPE "public"."consent_source" ADD VALUE 'TRAINING';--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "recipient_id" text;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "recipient_name" text;