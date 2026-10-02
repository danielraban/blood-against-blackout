import { NextResponse } from "next/server";
import { hasAiGatewayAuth } from "@/lib/ai-auth";
import { searchAllowedNotes } from "@/lib/chat-lookup";
import { FINDER_NOTE_HITS } from "@/lib/chat-notes";
import {
  isChatBodyTooLarge,
  parseNotesSearchRequest,
} from "@/lib/chat-request";

export const maxDuration = 30;

export async function POST(request: Request) {
  const raw = await request.text();
  if (isChatBodyTooLarge(Buffer.byteLength(raw))) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseNotesSearchRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  if (!hasAiGatewayAuth()) {
    return NextResponse.json({ error: "Search is unavailable" }, { status: 503 });
  }

  try {
    const notes = await searchAllowedNotes(
      parsed.value.query,
      parsed.value.meetings,
      FINDER_NOTE_HITS,
    );
    return NextResponse.json({
      hits: notes.map((note) => ({
        feedId: note.feedId,
        slug: note.slug,
        score: note.score,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    console.error("notes-search.failed", { message });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
