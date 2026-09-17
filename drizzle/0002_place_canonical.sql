ALTER TABLE "meetings" ADD COLUMN "neighborhood" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "parent_label" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE TABLE "place_canonical_cache" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"city" text,
	"neighborhood" text,
	"state" text,
	"country" text,
	"postal_code" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"confidence" real,
	"source" text NOT NULL,
	"cached_at" timestamp with time zone NOT NULL
);
