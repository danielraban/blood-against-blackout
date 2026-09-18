import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/admin";
import { ingestAllFeeds, DEFAULT_INGEST_LIMIT, MAX_INGEST_LIMIT, INGEST_TIME_BUDGET_MS } from "@/lib/ingest";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedLimit = Number(
    new URL(request.url).searchParams.get("limit") ?? DEFAULT_INGEST_LIMIT,
  );
  const limit = Math.min(
    Math.max(Math.floor(requestedLimit) || DEFAULT_INGEST_LIMIT, 1),
    MAX_INGEST_LIMIT,
  );
  const startedAt = Date.now();
  try {
    const result = await ingestAllFeeds({ limit, maxMs: INGEST_TIME_BUDGET_MS });
    console.info("cron.ingest.complete", {
      ...result,
      errors: result.errors.length,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    console.error("cron.ingest.failed", {
      message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
