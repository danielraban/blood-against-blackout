import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/admin";
import {
  DEFAULT_EMBED_LIMIT,
  embedNotesBatch,
  MAX_EMBED_LIMIT,
} from "@/lib/embed-notes";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedLimit = Number(
    new URL(request.url).searchParams.get("limit") ?? DEFAULT_EMBED_LIMIT,
  );
  const limit = Math.min(
    Math.max(Math.floor(requestedLimit) || DEFAULT_EMBED_LIMIT, 1),
    MAX_EMBED_LIMIT,
  );
  const startedAt = Date.now();
  try {
    const result = await embedNotesBatch({ limit });
    console.info("cron.embed_notes.complete", {
      ...result,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embed failed";
    console.error("cron.embed_notes.failed", {
      message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
