-- COR-1 / COR-4: one correction per (offer, field). Expand step: add a unique index so
-- re-saving the same fix updates the audit row (service switches insert -> upsert) instead of
-- inserting a duplicate. Existing duplicate rows (inserted before this change) would make
-- CREATE UNIQUE INDEX fail, so collapse them to the most recent first.
--
-- NEEDS REAL POSTGRES before deploy: this file was hand-authored in an environment with no
-- live DB. Regenerate drizzle/meta/0009_snapshot.json and the _journal.json entry via
-- `drizzle-kit generate` on the machine that has Postgres — they are NOT generated here.
--
-- Dedupe is data repair, not schema: keep the newest correctedValue per (offer_id, field).
-- ponytail: the dedupe is an O(n^2) self-join. Ceiling: fine while corrections-per-offer is
-- tiny (it is, by the new unique constraint). Upgrade path: a window-function dedupe
-- (ROW_NUMBER() OVER (PARTITION BY offer_id, field ORDER BY created_at DESC)) if it ever grows.
DELETE FROM "corrections" a
USING "corrections" b
WHERE a."offer_id" = b."offer_id"
  AND a."field"    = b."field"
  AND a."created_at" < b."created_at";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_corrections_offer_field" ON "corrections" USING btree ("offer_id","field");
-- Rollback (dev database; confirm first on a shared one):
--   DROP INDEX "uq_corrections_offer_field";
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = <the "when" of entry 0009 in drizzle/meta/_journal.json>;
-- The dedupe DELETE is NOT reversible (collapsed duplicates are gone); it is a no-op on a clean table.
