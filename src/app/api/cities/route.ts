import { NextResponse } from "next/server";
import { getCities } from "@/lib/city-search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  try {
    return NextResponse.json(
      { cities: await getCities(q) },
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
