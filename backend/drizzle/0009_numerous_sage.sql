-- COR-1 / COR-4: one correction per (offer, field). The service now upserts on this pair
-- (ON CONFLICT (offer_id, field)), which Postgres only accepts if this unique index exists.
--
-- Rows saved before this change can already contain duplicates for a pair, and CREATE UNIQUE
-- INDEX fails on them, so keep only the newest row per (offer_id, field) first. Ties on
-- created_at are broken by id, so exactly one row always survives. This DELETE is data repair
-- and is NOT reversible; it is a no-op on a table without duplicates.
DELETE FROM "corrections" c
USING (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "offer_id", "field" ORDER BY "created_at" DESC, "id" DESC) AS rn
  FROM "corrections"
) d
WHERE c."id" = d."id" AND d.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_corrections_offer_field" ON "corrections" USING btree ("offer_id","field");
-- Rollback (confirm first on a shared database):
--   DROP INDEX "uq_corrections_offer_field";
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792481166777;
--   (1792481166777 is the "when" of entry 0009 in drizzle/meta/_journal.json.)
