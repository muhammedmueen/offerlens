CREATE TABLE "quota_counters" (
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_counters_subject_type_subject_id_feature_day_pk" PRIMARY KEY("subject_type","subject_id","feature","day"),
	CONSTRAINT "quota_counters_subject_type_check" CHECK ("quota_counters"."subject_type" IN ('user', 'guest')),
	CONSTRAINT "quota_counters_count_check" CHECK ("quota_counters"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "quota_subject_type" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "quota_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "quota_day" date;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "quota_refunded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" DROP COLUMN "analysis_count";--> statement-breakpoint
ALTER TABLE "guests" DROP COLUMN "daily_reset_at";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_check" CHECK ("users"."plan" IN ('free', 'unlimited'));