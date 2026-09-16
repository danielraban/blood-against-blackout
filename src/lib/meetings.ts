import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { entities, feeds, meetings } from "./schema";
import { toMeeting } from "./slices";

export async function getMeeting(feedId: string, slug: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.feedId, feedId), eq(meetings.slug, slug)))
    .limit(1);
  if (!row) return null;
  const [entity] = row.entityId
    ? await db.select().from(entities).where(eq(entities.id, row.entityId)).limit(1)
    : [];
  const [feed] = await db.select().from(feeds).where(eq(feeds.id, feedId)).limit(1);
  return toMeeting(row, entity, feed?.name ?? feedId);
}
