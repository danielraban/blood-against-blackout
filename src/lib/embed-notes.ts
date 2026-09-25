import { createHash } from "node:crypto";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { embedMany } from "ai";
import { getDb } from "./db";
import { meetingNoteEmbeddings, meetings } from "./schema";
import { hasAiGatewayAuth } from "./ai-auth";

export const DEFAULT_EMBED_LIMIT = 50;
export const MAX_EMBED_LIMIT = 100;
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;
export const EMBED_BATCH_SIZE = 20;

export type NoteMeeting = {
  feedId: string;
  slug: string;
  notes: string | null;
  locationNotes: string | null;
  geohash4: string | null;
};

export type ExistingNoteEmbedding = {
  feedId: string;
  slug: string;
  contentHash: string;
};

export function combineMeetingNotes(
  notes: string | null,
  locationNotes: string | null,
) {
  const parts = [notes, locationNotes]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

export function hashNoteContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function planNoteEmbeddings(
  rows: NoteMeeting[],
  existing: ExistingNoteEmbedding[],
) {
  const current = new Map(
    existing.map((row) => [`${row.feedId}:${row.slug}`, row.contentHash]),
  );
  const toEmbed: Array<NoteMeeting & { content: string; contentHash: string }> =
    [];
  const keep = new Set<string>();

  for (const row of rows) {
    const content = combineMeetingNotes(row.notes, row.locationNotes);
    if (!content) continue;
    const key = `${row.feedId}:${row.slug}`;
    const contentHash = hashNoteContent(content);
    keep.add(key);
    if (current.get(key) === contentHash) continue;
    toEmbed.push({ ...row, content, contentHash });
  }

  const toDelete = existing
    .filter((row) => !keep.has(`${row.feedId}:${row.slug}`))
    .map((row) => ({ feedId: row.feedId, slug: row.slug }));

  return { toEmbed, toDelete };
}

export type EmbedNotesResult = {
  considered: number;
  embedded: number;
  skipped: number;
  deleted: number;
};

export async function embedNotesBatch(options?: {
  limit?: number;
}): Promise<EmbedNotesResult> {
  if (!hasAiGatewayAuth()) {
    throw new Error("AI gateway is not configured");
  }

  const limit = Math.min(
    Math.max(Math.floor(options?.limit ?? DEFAULT_EMBED_LIMIT), 1),
    MAX_EMBED_LIMIT,
  );
  const db = getDb();
  const noted = await db
    .select({
      feedId: meetings.feedId,
      slug: meetings.slug,
      notes: meetings.notes,
      locationNotes: meetings.locationNotes,
      geohash4: meetings.geohash4,
    })
    .from(meetings)
    .where(
      or(
        and(isNotNull(meetings.notes), sql`btrim(${meetings.notes}) <> ''`),
        and(
          isNotNull(meetings.locationNotes),
          sql`btrim(${meetings.locationNotes}) <> ''`,
        ),
      ),
    );

  const existing = await db
    .select({
      feedId: meetingNoteEmbeddings.feedId,
      slug: meetingNoteEmbeddings.slug,
      contentHash: meetingNoteEmbeddings.contentHash,
    })
    .from(meetingNoteEmbeddings);

  const plan = planNoteEmbeddings(noted, existing);
  for (const row of plan.toDelete) {
    await db
      .delete(meetingNoteEmbeddings)
      .where(
        and(
          eq(meetingNoteEmbeddings.feedId, row.feedId),
          eq(meetingNoteEmbeddings.slug, row.slug),
        ),
      );
  }

  const pending = plan.toEmbed.slice(0, limit);
  let embedded = 0;
  for (let index = 0; index < pending.length; index += EMBED_BATCH_SIZE) {
    const chunk = pending.slice(index, index + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: chunk.map((row) => row.content),
      providerOptions: {
        openai: { dimensions: EMBEDDING_DIMENSIONS },
      },
    });
    const now = new Date();
    for (const [offset, row] of chunk.entries()) {
      const embedding = embeddings[offset];
      if (!embedding) continue;
      await db
        .insert(meetingNoteEmbeddings)
        .values({
          feedId: row.feedId,
          slug: row.slug,
          contentHash: row.contentHash,
          geohash4: row.geohash4,
          embedding,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [meetingNoteEmbeddings.feedId, meetingNoteEmbeddings.slug],
          set: {
            contentHash: row.contentHash,
            geohash4: row.geohash4,
            embedding,
            updatedAt: now,
          },
        });
      embedded += 1;
    }
  }

  return {
    considered: noted.length,
    embedded,
    skipped: noted.length - pending.length,
    deleted: plan.toDelete.length,
  };
}
