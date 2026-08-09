CREATE TABLE "course_crosswalk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" text NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_crosswalk_catalog_key_unique" UNIQUE("catalog_key")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"credit_hours" text,
	"prereq_text" text,
	"catalog_year" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"former_identities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crosswalk_pending" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"candidate_course_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crosswalk_pending_catalog_key_unique" UNIQUE("catalog_key")
);
--> statement-breakpoint
ALTER TABLE "course_crosswalk" ADD CONSTRAINT "course_crosswalk_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;