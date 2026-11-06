ALTER TYPE "public"."role" ADD VALUE 'CASHIER';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "admin_sections" text[];