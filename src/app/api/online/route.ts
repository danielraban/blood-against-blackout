import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { entities, feeds, meetings } from "@/lib/schema";
import { collapseDuplicateMeetings } from "@/lib/search";
import { toMeeting } from "@/lib/slices";
import {
  freshFeedPredicate,
  safeMeetingPredicate,
} from "@/lib/verification";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 80) || 80, 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
  const db = getDb();
  try {
    const rows = await db
      .select({ meeting: meetings, feed: feeds })
      .from(meetings)
      .innerJoin(
        feeds,
        and(eq(feeds.id, meetings.feedId), freshFeedPredicate()),
      )
      .where(
        and(
          inArray(meetings.attendance, ["online", "hybrid"]),
          safeMeetingPredicate(),
        ),
      )
      .orderBy(sql`${meetings.day} asc nulls last, ${meetings.time} asc nulls last`)
      .limit(limit)
      .offset(offset);

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

    return NextResponse.json(
      {
        meetings: collapseDuplicateMeetings(
          rows.map(({ meeting, feed }) =>
            toMeeting(
              meeting,
              meeting.entityId ? entityMap.get(meeting.entityId) : undefined,
              feed,
            ),
          ),
        ),
        offset,
        limit,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Online failed";
    console.error("api.online.failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
