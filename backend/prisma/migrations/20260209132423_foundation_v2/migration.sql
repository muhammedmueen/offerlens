-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_url" TEXT,
    "extracted_data" JSONB,
    "user_corrections" JSONB,
    "red_flags_result" JSONB,
    "market_comparison" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_submissions" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "normalized_role" TEXT,
    "experience_years" INTEGER,
    "location" TEXT NOT NULL,
    "base_salary" DECIMAL(12,2),
    "equity" TEXT,
    "sign_on_bonus" DECIMAL(12,2),
    "company_tier" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "red_flag_vectors" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sample_text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "red_flag_vectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_scripts" (
    "id" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "script_body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "negotiation_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "offers_status_created_at_idx" ON "offers"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "salary_submissions_role_location_idx" ON "salary_submissions"("role", "location");

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_scripts_scenario_key" ON "negotiation_scripts"("scenario");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
