import { NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cities, feeds, meetings } from "@/lib/schema";
import { freshFeedPredicate, isSourceFresh, safeMeetingPredicate } from "@/lib/verification";

export async function GET() {
  const db = getDb();
  try {
    const [feedRows, cityRows, geoRows, meetingTotal, feedTotals] = await Promise.all([
      db.select().from(feeds),
      db
        .select()
        .from(cities)
        .orderBy(sql`${cities.meetingCount} desc`)
        .limit(200),
      db
        .select({
          geohash4: meetings.geohash4,
          count: sql<number>`count(*)::int`,
          lat: sql<number>`avg(${meetings.lat})::float`,
          lng: sql<number>`avg(${meetings.lng})::float`,
        })
        .from(meetings)
        .innerJoin(feeds, eq(meetings.feedId, feeds.id))
        .where(and(freshFeedPredicate(), sql`${meetings.geohash4} is not null`))
        .groupBy(meetings.geohash4)
        .orderBy(sql`count(*) desc`)
        .limit(400),
      db
        .select({ count: count() })
        .from(meetings)
        .innerJoin(feeds, eq(meetings.feedId, feeds.id))
        .where(and(freshFeedPredicate(), safeMeetingPredicate())),
      db
        .select({
          status: feeds.status,
          count: count(),
        })
        .from(feeds)
        .groupBy(feeds.status),
    ]);
    const freshFeeds = feedRows.filter((feed) =>
      isSourceFresh(feed.status, feed.lastOkAt),
    );
    const enabledFeeds = feedRows.filter((feed) => feed.status !== "disabled");
    return NextResponse.json(
      {
        totals: {
          freshWeeklyOccurrences: meetingTotal[0]?.count ?? 0,
          freshFeedCount: freshFeeds.length,
          enabledFeedCount: enabledFeeds.length,
          catalogFeedCount: feedRows.length,
          meetingGuideEntities: 500,
          meetingGuideWeeklyMeetings: 150000,
        },
        feeds: feedRows.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          meetingCount: f.meetingCount,
          regionHint: f.regionHint,
          fellowship: f.fellowship,
          lastOkAt: f.lastOkAt,
        })),
        cities: cityRows,
        cells: geoRows,
        feedStatus: Object.fromEntries(feedTotals.map((row) => [row.status, row.count])),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coverage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
