-- Task 5.1b: derived PLFS 2023-24 city pay factors (aggregates only; at most six rows per version).
-- Expand-only: one new table plus its unique index. Nothing existing is altered and nothing is backfilled;
-- the previous code never reads it, and an empty table makes the lookup serve national figures.
-- Rollback (dev database; confirm first on a shared one):
--   DROP TABLE "city_pay_factors";
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791890009175;   -- the "when" of entry 0008 in drizzle/meta/_journal.json
-- Without the DELETE a later db:migrate treats 0008 as applied and never recreates the table.
-- Behavioural rollback with no schema change: DELETE FROM city_pay_factors;  (the lookup then serves national figures.)
CREATE TABLE "city_pay_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"city" text NOT NULL,
	"n_respondents" integer NOT NULL,
	"national_n" integer NOT NULL,
	"raw_ratio" double precision NOT NULL,
	"shrinkage_weight" double precision NOT NULL,
	"factor" double precision NOT NULL,
	"licence" text NOT NULL,
	"reference_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_pay_factors_n_check" CHECK ("city_pay_factors"."n_respondents" >= 30),
	CONSTRAINT "city_pay_factors_national_n_check" CHECK ("city_pay_factors"."national_n" >= 30),
	CONSTRAINT "city_pay_factors_ratio_check" CHECK ("city_pay_factors"."raw_ratio" BETWEEN 0.5 AND 2.0),
	CONSTRAINT "city_pay_factors_weight_check" CHECK ("city_pay_factors"."shrinkage_weight" > 0 AND "city_pay_factors"."shrinkage_weight" < 1),
	CONSTRAINT "city_pay_factors_factor_check" CHECK ("city_pay_factors"."factor" BETWEEN 0.5 AND 2.0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_city_pay_factor" ON "city_pay_factors" USING btree ("source","source_version","city");