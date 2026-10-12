CREATE TABLE "salary_reference_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"source_row_id" text NOT NULL,
	"licence" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"role" text NOT NULL,
	"city" text,
	"experience_years" integer NOT NULL,
	"ctc" integer NOT NULL,
	"company_type" text,
	"company_size" text,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_reference_rows_ctc_check" CHECK ("salary_reference_rows"."ctc" > 0),
	CONSTRAINT "salary_reference_rows_experience_check" CHECK ("salary_reference_rows"."experience_years" BETWEEN 0 AND 60),
	CONSTRAINT "salary_reference_rows_weight_check" CHECK ("salary_reference_rows"."weight" > 0)
);
--> statement-breakpoint
CREATE INDEX "idx_salary_ref_lookup" ON "salary_reference_rows" USING btree ("source","role","experience_years");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_salary_ref_row" ON "salary_reference_rows" USING btree ("source","source_version","source_row_id");