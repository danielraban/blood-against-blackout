import { NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { entities, feeds, meetings } from "@/lib/schema";
import { toMeeting } from "@/lib/slices";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 80) || 80, 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(meetings)
      .where(inArray(meetings.attendance, ["online", "hybrid"]))
      .orderBy(sql`${meetings.day} asc nulls last, ${meetings.time} asc nulls last`)
      .limit(limit)
      .offset(offset);

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

    return NextResponse.json(
      {
        meetings: rows.map((row) =>
          toMeeting(
            row,
            row.entityId ? entityMap.get(row.entityId) : undefined,
            feedMap.get(row.feedId)?.name ?? row.feedId,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
