ALTER TABLE "reviews" ADD COLUMN "removed_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "deleted_at" timestamp with time zone;