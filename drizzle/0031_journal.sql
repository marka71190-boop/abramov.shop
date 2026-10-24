CREATE TABLE "article" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover" text,
	"section" text DEFAULT 'tips' NOT NULL,
	"product_ids" text[] DEFAULT '{}' NOT NULL,
	"visibility" "visibility" DEFAULT 'DRAFT' NOT NULL,
	"publish_at" timestamp with time zone,
	"preview_token" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_slug_unique" UNIQUE("slug"),
	CONSTRAINT "article_preview_token_unique" UNIQUE("preview_token")
);
--> statement-breakpoint
CREATE INDEX "article_section_idx" ON "article" USING btree ("section");