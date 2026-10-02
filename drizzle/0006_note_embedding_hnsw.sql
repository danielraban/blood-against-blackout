CREATE INDEX IF NOT EXISTS "meeting_note_embeddings_hnsw_idx" ON "meeting_note_embeddings" USING hnsw ("embedding" vector_cosine_ops);
