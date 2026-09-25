import { cosineSimilarity } from "ai";
import { allowedMeetingKeys, meetingKey } from "./chat-meetings";
import type { ChatMeetingRef } from "./chat-request";

export const MAX_NOTE_HITS = 5;
export const NOTE_SIMILARITY_MIN = 0.3;

export type NoteEmbeddingRow = {
  feedId: string;
  slug: string;
  embedding: number[];
  notes: string | null;
  locationNotes: string | null;
  name: string;
};

export type NoteHit = {
  feedId: string;
  slug: string;
  name: string;
  notes: string | null;
  locationNotes: string | null;
  score: number;
  href: string;
};

export function rankNoteHits(
  queryEmbedding: number[],
  rows: NoteEmbeddingRow[],
  allowed: ChatMeetingRef[],
): NoteHit[] {
  const keys = allowedMeetingKeys(allowed);
  return rows
    .filter((row) => keys.has(meetingKey(row.feedId, row.slug)))
    .map((row) => ({
      feedId: row.feedId,
      slug: row.slug,
      name: row.name,
      notes: row.notes,
      locationNotes: row.locationNotes,
      score: cosineSimilarity(queryEmbedding, row.embedding),
      href: `/meetings/${row.feedId}/${row.slug}`,
    }))
    .filter((hit) => hit.score >= NOTE_SIMILARITY_MIN)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_NOTE_HITS);
}
