import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { hasAiGatewayAuth } from "@/lib/ai-auth";
import { isCrisisAsk, latestUserText } from "@/lib/chat-crisis";
import { CHAT_EMERGENCY_GUIDANCE, chatSystemPrompt } from "@/lib/chat-prompt";
import {
  isChatBodyTooLarge,
  parseChatRequest,
} from "@/lib/chat-request";
import { createChatTools } from "@/lib/chat-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public route. Add a Vercel Firewall rate limit on POST /api/chat so
// gateway spend cannot run away.

function crisisResponse() {
  const stream = createUIMessageStream({
    execute({ writer }) {
      const id = "crisis";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: CHAT_EMERGENCY_GUIDANCE });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

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

  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  if (isCrisisAsk(latestUserText(parsed.value.messages))) {
    return crisisResponse();
  }
  if (!hasAiGatewayAuth()) {
    return NextResponse.json({ error: "Ask is unavailable" }, { status: 503 });
  }

  const result = streamText({
    model: "openai/gpt-5.4-mini",
    system: chatSystemPrompt(),
    messages: await convertToModelMessages(parsed.value.messages as UIMessage[]),
    tools: createChatTools(parsed.value.meetings),
    stopWhen: stepCountIs(5),
    onError({ error }) {
      const message = error instanceof Error ? error.message : "Ask failed";
      console.error("chat.failed", { message });
    },
  });

  return result.toUIMessageStreamResponse();
}
