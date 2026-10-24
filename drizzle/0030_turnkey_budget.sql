ALTER TABLE "turnkey_request" ALTER COLUMN "total" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "turnkey_request" ADD COLUMN "table_gap" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
ALTER TABLE "turnkey_request" ADD COLUMN "budget" bigint;