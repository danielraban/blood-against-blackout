import { NextResponse } from "next/server";
import { ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cities } from "@/lib/schema";
import { collapseCitySuggestions, escapeIlike } from "@/lib/location";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const db = getDb();
  try {
    const pattern = q ? `%${escapeIlike(q)}%` : "";
    const rows = q
      ? await db
          .select()
          .from(cities)
          .where(
            or(
              ilike(cities.label, pattern),
              ilike(cities.slug, pattern),
              ilike(cities.parentLabel, pattern),
              sql`exists (select 1 from unnest(${cities.aliases}) alias where alias ilike ${pattern})`,
            ),
          )
          .orderBy(
            sql`
              case
                when lower(${cities.label}) = lower(${q}) then 0
                when lower(${cities.label}) like lower(${q}) || '%' then 1
                when lower(coalesce(${cities.parentLabel}, '')) = lower(${q}) then 2
                else 3
              end,
              ${cities.meetingCount} desc
            `,
          )
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
