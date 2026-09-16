import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cities, feeds, meetings } from "@/lib/schema";

export async function GET() {
  const db = getDb();
  try {
    const [feedRows, cityRows, geoRows] = await Promise.all([
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
        .where(sql`${meetings.geohash4} is not null`)
        .groupBy(meetings.geohash4)
        .orderBy(sql`count(*) desc`)
        .limit(400),
    ]);
    return NextResponse.json(
      {
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
