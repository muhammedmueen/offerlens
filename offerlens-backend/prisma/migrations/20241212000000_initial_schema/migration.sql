-- CreateTable
CREATE TABLE "salary_benchmarks" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "experience_level" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "min_salary" DECIMAL(10,2) NOT NULL,
    "avg_salary" DECIMAL(10,2) NOT NULL,
    "max_salary" DECIMAL(10,2) NOT NULL,
    "effective_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "red_flag_rules" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keywords" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "red_flag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_requests" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "user_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "votes" INTEGER NOT NULL DEFAULT 0,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_request_votes" (
    "id" TEXT NOT NULL,
    "feature_request_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_request_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_benchmarks_role_experience_level_city_idx" ON "salary_benchmarks"("role", "experience_level", "city");

-- CreateIndex
CREATE UNIQUE INDEX "salary_benchmarks_role_experience_level_city_effective_date_key" ON "salary_benchmarks"("role", "experience_level", "city", "effective_date");

-- CreateIndex
CREATE INDEX "red_flag_rules_active_idx" ON "red_flag_rules"("active");

-- CreateIndex
CREATE UNIQUE INDEX "red_flag_rules_rule_id_key" ON "red_flag_rules"("rule_id");

-- CreateIndex
CREATE INDEX "feature_requests_status_created_at_idx" ON "feature_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "feature_request_votes_feature_request_id_ip_address_key" ON "feature_request_votes"("feature_request_id", "ip_address");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_created_at_idx" ON "analytics_events"("event_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- AddForeignKey
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_feature_request_id_fkey" FOREIGN KEY ("feature_request_id") REFERENCES "feature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
