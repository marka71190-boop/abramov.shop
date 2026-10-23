ALTER TYPE "public"."role" ADD VALUE 'CLUB';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "club_id" text;