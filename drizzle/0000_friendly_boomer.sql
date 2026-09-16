CREATE TABLE "cities" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"country" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"geohash4" text NOT NULL,
	"meeting_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"url" text,
	"location_text" text,
	"feedback_emails" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"region_hint" text,
	"fellowship" text DEFAULT 'aa' NOT NULL,
	"format" text DEFAULT 'tsml' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"meeting_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "feeds_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"cached_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"feeds_ok" integer DEFAULT 0 NOT NULL,
	"feeds_fail" integer DEFAULT 0 NOT NULL,
	"meetings_upserted" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"feed_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text,
	"day" integer,
	"time" text,
	"end_time" text,
	"timezone" text,
	"types" text[] DEFAULT '{}' NOT NULL,
	"attendance" text NOT NULL,
	"fellowship" text DEFAULT 'aa' NOT NULL,
	"location_name" text,
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"formatted_address" text,
	"lat" real,
	"lng" real,
	"geohash4" text,
	"conference_url" text,
	"conference_phone" text,
	"notes" text,
	"location_notes" text,
	"updated_at" timestamp with time zone,
	"entity_id" text,
	CONSTRAINT "meetings_feed_id_slug_pk" PRIMARY KEY("feed_id","slug")
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cities_label_country_idx" ON "cities" USING btree ("label","country");--> statement-breakpoint
CREATE INDEX "cities_geohash_idx" ON "cities" USING btree ("geohash4");--> statement-breakpoint
CREATE INDEX "entities_feed_idx" ON "entities" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "meetings_geohash_idx" ON "meetings" USING btree ("geohash4");--> statement-breakpoint
CREATE INDEX "meetings_attendance_idx" ON "meetings" USING btree ("attendance");--> statement-breakpoint
CREATE INDEX "meetings_city_idx" ON "meetings" USING btree ("city");--> statement-breakpoint
CREATE INDEX "meetings_fellowship_idx" ON "meetings" USING btree ("fellowship");