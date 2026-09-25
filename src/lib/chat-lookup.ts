import { and, eq, or, type Column } from "drizzle-orm";
import { embed } from "ai";
import { getDb } from "./db";
import { meetingNoteEmbeddings, meetings } from "./schema";
import { asFellowship } from "./fellowship";
import type { Meeting } from "./types";
import type { ChatMeetingRef } from "./chat-request";
import { rankNoteHits, type NoteEmbeddingRow } from "./chat-notes";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./embed-notes";

function allowedPredicate(
  feedCol: Column,
  slugCol: Column,
  allowed: ChatMeetingRef[],
) {
  return or(
    ...allowed.map((item) =>
      and(eq(feedCol, item.feedId), eq(slugCol, item.slug)),
    ),
  );
}

function toMeeting(row: typeof meetings.$inferSelect): Meeting {
  return {
    feedId: row.feedId,
    slug: row.slug,
    name: row.name,
    groupName: row.groupName,
    day: row.day,
    time: row.time,
    endTime: row.endTime,
    timezone: row.timezone,
    types: row.types ?? [],
    attendance: row.attendance as Meeting["attendance"],
    fellowship: asFellowship(row.fellowship),
    locationName: row.locationName,
    address: row.address,
    city: row.city,
    neighborhood: row.neighborhood,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    formattedAddress: row.formattedAddress,
    lat: row.lat,
    lng: row.lng,
    geohash4: row.geohash4,
    conferenceUrl: row.conferenceUrl,
    conferencePhone: row.conferencePhone,
    notes: row.notes,
    locationNotes: row.locationNotes,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    sourceVerifiedAt: null,
    entityId: row.entityId,
    entityName: null,
    entityPhone: null,
    entityEmail: null,
    entityUrl: null,
    feedbackEmails: [],
  };
}

export async function loadAllowedMeetings(allowed: ChatMeetingRef[]) {
  if (allowed.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(allowedPredicate(meetings.feedId, meetings.slug, allowed));
  return rows.map(toMeeting);
}

export async function loadAllowedNoteRows(allowed: ChatMeetingRef[]) {
  if (allowed.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      feedId: meetingNoteEmbeddings.feedId,
      slug: meetingNoteEmbeddings.slug,
      embedding: meetingNoteEmbeddings.embedding,
      notes: meetings.notes,
      locationNotes: meetings.locationNotes,
      name: meetings.name,
    })
    .from(meetingNoteEmbeddings)
    .innerJoin(
      meetings,
      and(
        eq(meetings.feedId, meetingNoteEmbeddings.feedId),
        eq(meetings.slug, meetingNoteEmbeddings.slug),
      ),
    )
    .where(
      allowedPredicate(
        meetingNoteEmbeddings.feedId,
        meetingNoteEmbeddings.slug,
        allowed,
      ),
    );
  return rows as NoteEmbeddingRow[];
}

export async function searchAllowedNotes(
  query: string,
  allowed: ChatMeetingRef[],
) {
  if (allowed.length === 0 || !query.trim()) return [];
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: query.trim(),
    providerOptions: {
      openai: { dimensions: EMBEDDING_DIMENSIONS },
    },
  });
  const rows = await loadAllowedNoteRows(allowed);
  return rankNoteHits(embedding, rows, allowed);
}
