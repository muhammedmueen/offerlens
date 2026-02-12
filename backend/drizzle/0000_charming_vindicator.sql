CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"score_label" text NOT NULL,
	"scoring_method" text DEFAULT 'standard' NOT NULL,
	"extracted_data" jsonb NOT NULL,
	"red_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"salary_comparison" jsonb NOT NULL,
	"negotiation_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"take_home" jsonb,
	"ai_metadata" jsonb NOT NULL,
	"low_confidence" boolean DEFAULT false NOT NULL,
	"red_flags_discarded" integer DEFAULT 0 NOT NULL,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_offer_id_unique" UNIQUE("offer_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"guest_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_request_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"ip_address" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_frv_unique" UNIQUE("feature_request_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "feature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"submitted_by_fingerprint" text NOT NULL,
	"submitted_by_ip" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"ip_address" "inet" NOT NULL,
	"analysis_count" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp with time zone NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid,
	"raw_text" text,
	"text_hash" text,
	"ocr_confidence" real,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"user_context" jsonb,
	"failure_reason" text,
	"is_guest" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_text_hash_unique" UNIQUE("text_hash")
);
--> statement-breakpoint
CREATE TABLE "offer_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metadata_cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'India' NOT NULL,
	CONSTRAINT "metadata_cities_name_country_unique" UNIQUE("name","country")
);
--> statement-breakpoint
CREATE TABLE "metadata_experience_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"min_years" integer NOT NULL,
	"max_years" integer NOT NULL,
	CONSTRAINT "metadata_experience_levels_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "metadata_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "metadata_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_files" ADD CONSTRAINT "offer_files_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analyses_score" ON "analyses" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_analytics_event" ON "analytics_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "idx_analytics_created" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_fr_vote_count" ON "feature_requests" USING btree ("vote_count");--> statement-breakpoint
CREATE INDEX "idx_offers_guest_id" ON "offers" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_offers_text_hash" ON "offers" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "idx_offers_status" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_offers_expires_at" ON "offers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_offers_created_at" ON "offers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_cities_country" ON "metadata_cities" USING btree ("country");