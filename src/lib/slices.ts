import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { entities, feeds, meetings } from "./schema";
import { neighborGeohashes } from "./geo";
import type { Meeting, SlicePayload } from "./types";
import { asFellowship } from "./fellowship";
import { freshFeedPredicate, safeMeetingPredicate } from "./verification";

function toMeeting(
  row: typeof meetings.$inferSelect,
  entity: typeof entities.$inferSelect | undefined,
  feed: typeof feeds.$inferSelect,
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
    sourceVerifiedAt: feed.lastOkAt ? feed.lastOkAt.toISOString() : null,
    entityId: row.entityId,
    entityName: entity?.name ?? feed.name,
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
    .select({ meeting: meetings, feed: feeds })
    .from(meetings)
    .innerJoin(
      feeds,
      and(eq(feeds.id, meetings.feedId), freshFeedPredicate()),
    )
    .where(
      and(
        inArray(meetings.geohash4, neighbors),
        safeMeetingPredicate(),
      ),
    );

  const entityIds = [
    ...new Set(
      rows
        .map((r) => r.meeting.entityId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const entityRows = entityIds.length
    ? await db.select().from(entities).where(inArray(entities.id, entityIds))
    : [];
  const entityMap = new Map(entityRows.map((e) => [e.id, e]));
  const feedRows = [...new Map(rows.map((r) => [r.feed.id, r.feed])).values()];

  return {
    geohash,
    neighbors,
    fetchedAt: new Date().toISOString(),
    meetings: rows.map(({ meeting, feed }) =>
      toMeeting(
        meeting,
        meeting.entityId ? entityMap.get(meeting.entityId) : undefined,
        feed,
      ),
    ),
    sourceFeeds: feedRows.map((f) => ({ id: f.id, name: f.name })),
  };
}

export { toMeeting };
