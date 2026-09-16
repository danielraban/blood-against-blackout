DROP INDEX "cities_label_country_idx";--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "meetings" AS m
SET "verified_at" = f."last_ok_at"
FROM "feeds" AS f
WHERE f."id" = m."feed_id";--> statement-breakpoint
UPDATE "ingest_runs"
SET "status" = CASE
  WHEN "finished_at" IS NULL THEN 'incomplete'
  WHEN "feeds_fail" > 0 THEN 'completed_with_errors'
  ELSE 'completed'
END;--> statement-breakpoint
CREATE UNIQUE INDEX "cities_label_state_country_idx" ON "cities" USING btree ("label","state","country","geohash4");