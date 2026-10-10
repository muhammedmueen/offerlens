CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"guest_id" uuid,
	"offer_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"units" integer,
	"cost_usd" numeric(12, 6),
	"success" boolean NOT NULL,
	"error_code" text,
	"billed_to" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_user_created" ON "usage_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_guest_created" ON "usage_ledger" USING btree ("guest_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_created_at" ON "usage_ledger" USING btree ("created_at");