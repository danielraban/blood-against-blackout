ALTER TABLE "feeds" ADD COLUMN IF NOT EXISTS "etag" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN IF NOT EXISTS "last_modified" text;
