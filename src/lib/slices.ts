import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { entities, feeds, meetings } from "./schema";
import { neighborGeohashes } from "./geo";
import type { Meeting, SlicePayload } from "./types";
import { asFellowship } from "./fellowship";

function toMeeting(
  row: typeof meetings.$inferSelect,
  entity: typeof entities.$inferSelect | undefined,
  feedName: string,
): Meeting {
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
    entityId: row.entityId,
    entityName: entity?.name ?? feedName,
    entityPhone: entity?.phone ?? null,
    entityEmail: entity?.email ?? null,
    entityUrl: entity?.url ?? null,
    feedbackEmails: entity?.feedbackEmails ?? [],
  };
}

export async function getSlice(geohash: string): Promise<SlicePayload> {
  const db = getDb();
  const neighbors = neighborGeohashes(geohash);
  const rows = await db
    .select()
    .from(meetings)
    .where(inArray(meetings.geohash4, neighbors));

  const entityIds = [
    ...new Set(rows.map((r) => r.entityId).filter((id): id is string => Boolean(id))),
  ];
  const feedIds = [...new Set(rows.map((r) => r.feedId))];
  const entityRows = entityIds.length
    ? await db.select().from(entities).where(inArray(entities.id, entityIds))
    : [];
  const feedRows = feedIds.length
    ? await db.select().from(feeds).where(inArray(feeds.id, feedIds))
    : [];
  const entityMap = new Map(entityRows.map((e) => [e.id, e]));
  const feedMap = new Map(feedRows.map((f) => [f.id, f]));

  return {
    geohash,
    neighbors,
    fetchedAt: new Date().toISOString(),
    meetings: rows.map((row) =>
      toMeeting(row, row.entityId ? entityMap.get(row.entityId) : undefined, feedMap.get(row.feedId)?.name ?? row.feedId),
    ),
    sourceFeeds: feedRows.map((f) => ({ id: f.id, name: f.name })),
  };
}

export { toMeeting };
