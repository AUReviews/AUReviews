CREATE TABLE "instructor_pending" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_key" text NOT NULL,
	"display_name" text NOT NULL,
	"banner_key" text,
	"reason" text NOT NULL,
	"candidate_instructor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructor_pending_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"banner_key" text,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructors_banner_key_unique" UNIQUE("banner_key")
);
--> statement-breakpoint
CREATE TABLE "offering_instructors" (
	"course_id" uuid NOT NULL,
	"term_code" text NOT NULL,
	"instructor_id" uuid NOT NULL,
	CONSTRAINT "offering_instructors_course_id_term_code_instructor_id_pk" PRIMARY KEY("course_id","term_code","instructor_id")
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"course_id" uuid NOT NULL,
	"term_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offerings_course_id_term_code_pk" PRIMARY KEY("course_id","term_code")
);
--> statement-breakpoint
ALTER TABLE "offering_instructors" ADD CONSTRAINT "offering_instructors_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_instructors" ADD CONSTRAINT "offering_instructors_course_id_term_code_offerings_course_id_term_code_fk" FOREIGN KEY ("course_id","term_code") REFERENCES "public"."offerings"("course_id","term_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instructors_name_key_idx" ON "instructors" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "offering_instructors_instructor_idx" ON "offering_instructors" USING btree ("instructor_id");