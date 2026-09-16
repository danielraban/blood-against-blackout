import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { entities, feeds, meetings } from "./schema";
import { toMeeting } from "./slices";
import { freshFeedPredicate, safeMeetingPredicate } from "./verification";

export async function getMeeting(feedId: string, slug: string) {
  const db = getDb();
  const [result] = await db
    .select({ meeting: meetings, feed: feeds })
    .from(meetings)
    .innerJoin(
      feeds,
      and(eq(feeds.id, meetings.feedId), freshFeedPredicate()),
    )
    .where(
      and(
        eq(meetings.feedId, feedId),
        eq(meetings.slug, slug),
        safeMeetingPredicate(),
      ),
    )
    .limit(1);
  if (!result) return null;
  const [entity] = result.meeting.entityId
    ? await db
        .select()
        .from(entities)
        .where(eq(entities.id, result.meeting.entityId))
        .limit(1)
    : [];
  return toMeeting(result.meeting, entity, result.feed);
}
