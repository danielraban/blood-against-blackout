import { NextResponse } from "next/server";
import { getSlice } from "@/lib/slices";

export async function GET(
  _request: Request,
  context: { params: Promise<{ geohash: string }> },
) {
  const { geohash } = await context.params;
  if (!/^[0-9b-hjkmnp-z]{4}$/i.test(geohash)) {
    return NextResponse.json({ error: "Invalid geohash" }, { status: 400 });
  }
  try {
    const slice = await getSlice(geohash.toLowerCase());
    return NextResponse.json(slice, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slice failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
