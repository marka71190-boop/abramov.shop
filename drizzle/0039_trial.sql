ALTER TABLE "coach_profile" ADD COLUMN "trial" text DEFAULT 'OFF' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD COLUMN "trial_duration_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_slot" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;