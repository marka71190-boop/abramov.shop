CREATE TYPE "public"."question_status" AS ENUM('NEW', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TABLE "product_question" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text,
	"text" text NOT NULL,
	"answer" text,
	"answered_by_id" text,
	"answered_at" timestamp with time zone,
	"status" "question_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_question" ADD CONSTRAINT "product_question_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_question" ADD CONSTRAINT "product_question_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_question_product_idx" ON "product_question" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "product_question_status_idx" ON "product_question" USING btree ("status","created_at");