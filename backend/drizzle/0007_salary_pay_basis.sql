-- Task 5.7: label whether a submitted CTC is the submitter's current pay or an offered (not yet accepted) figure.
-- Expand-only: one nullable column. Rows stored earlier, and "Not sure" answers, stay NULL (no backfill).
-- A CHECK on an all-NULL column cannot fail on existing data, and NULL passes a CHECK.
-- Rollback (dev database; confirm first on a shared one):
--   ALTER TABLE "salary_submissions" DROP COLUMN "pay_basis";   -- drops the CHECK with it
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791881699089;   -- the "when" of entry 0007 in drizzle/meta/_journal.json
--   then delete the Redis keys salary:crowd:v3:* and redeploy the previous code (it never reads the column).
-- Without the DELETE a later db:migrate treats 0007 as applied and never recreates the column.
ALTER TABLE "salary_submissions" ADD COLUMN "pay_basis" text;--> statement-breakpoint
ALTER TABLE "salary_submissions" ADD CONSTRAINT "salary_submissions_pay_basis_check" CHECK ("salary_submissions"."pay_basis" IN ('current','offered'));
