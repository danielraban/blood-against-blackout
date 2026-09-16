import { NextResponse } from "next/server";
import { ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cities } from "@/lib/schema";
import { collapseCitySuggestions } from "@/lib/location";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const db = getDb();
  try {
    const rows = q
      ? await db
          .select()
          .from(cities)
          .where(
            or(
              ilike(cities.label, `%${q}%`),
              ilike(cities.slug, `%${q}%`),
            ),
          )
          .orderBy(sql`${cities.meetingCount} desc`)
          .limit(20)
      : await db
          .select()
          .from(cities)
          .orderBy(sql`${cities.meetingCount} desc`)
          .limit(40);
    return NextResponse.json(
      { cities: collapseCitySuggestions(rows) },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cities failed";
    console.error("api.cities.failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
