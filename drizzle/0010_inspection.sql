CREATE TABLE "inspection_media" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"return_id" text,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer,
	"drive_created_at" timestamp with time zone,
	"web_view_link" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_inspection" (
	"order_id" text PRIMARY KEY NOT NULL,
	"folder_id" text,
	"folder_url" text,
	"serial_number" text,
	"seal_number" text,
	"checklist" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"checked_at" timestamp with time zone,
	"checked_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inspection" ADD CONSTRAINT "order_inspection_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inspection" ADD CONSTRAINT "order_inspection_checked_by_id_user_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_media_order_idx" ON "inspection_media" USING btree ("order_id");