import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missingProductionEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const missing = missingProductionEnv();
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: "Server configuration is incomplete" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Database is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
