CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_note_embeddings" (
	"feed_id" text NOT NULL,
	"slug" text NOT NULL,
	"content_hash" text NOT NULL,
	"geohash4" text,
	"embedding" vector(512) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "meeting_note_embeddings_pkey" PRIMARY KEY("feed_id","slug"),
	CONSTRAINT "meeting_note_embeddings_meeting_fk" FOREIGN KEY ("feed_id","slug") REFERENCES "meetings"("feed_id","slug") ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_note_embeddings_geohash_idx" ON "meeting_note_embeddings" USING btree ("geohash4");
