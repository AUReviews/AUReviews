CREATE TABLE "review_votes" (
	"review_id" uuid NOT NULL,
	"identity_hash" text NOT NULL,
	"direction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_votes_review_id_identity_hash_pk" PRIMARY KEY("review_id","identity_hash")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"instructor_id" uuid,
	"instructor_unknown" text,
	"term_code" text NOT NULL,
	"overall" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"workload_hours" integer NOT NULL,
	"body" text NOT NULL,
	"workload_shape" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grade" text,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages_other" text,
	"curved" text,
	"attendance" text,
	"prep" text,
	"identity_hash" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"contested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_course_idx" ON "reviews" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "reviews_identity_idx" ON "reviews" USING btree ("identity_hash");