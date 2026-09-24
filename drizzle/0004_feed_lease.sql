ALTER TABLE "feeds" ADD COLUMN IF NOT EXISTS "leased_until" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone NOT NULL
);
