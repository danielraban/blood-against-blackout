"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMeetingRef } from "@/lib/chat-request";

export function AskPanel({
  geohash,
  citySlug,
  meetings,
}: {
  geohash: string | null;
  citySlug?: string | null;
  meetings: ChatMeetingRef[];
}) {
  const [input, setInput] = useState("");
  const hasArea = Boolean(geohash) || meetings.length > 0;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            geohash,
            citySlug: citySlug ?? null,
            meetings,
          },
        }),
      }),
    [citySlug, geohash, meetings],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  return (
    <section className="space-y-3 border-4 border-black bg-card p-4">
      <div>
        <h2 className="font-display text-2xl lowercase tracking-tight">ask</h2>
        <p className="text-sm text-muted">
          {hasArea
            ? "Ask about listings in this area, or how meetings work."
            : "Help questions work now. Use Nearby or pick a city to ask about meetings."}
        </p>
      </div>
      <div className="space-y-3" aria-live="polite">
        {messages.map((message) => {
          const text = message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
            .trim();
          if (!text) return null;
          return (
            <div key={message.id} className="space-y-1">
              <p className="text-sm font-semibold lowercase">
                {message.role === "user" ? "you" : "ask"}
              </p>
              <p className="whitespace-pre-wrap text-sm">{text}</p>
            </div>
          );
        })}
        {busy ? (
          <p className="text-sm text-muted">Looking that up…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-warn">Ask is unavailable right now.</p>
        ) : null}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const text = String(new FormData(form).get("question") ?? "").trim();
          if (!text || busy) return;
          void sendMessage({ text });
          setInput("");
        }}
      >
        <label className="sr-only" htmlFor="ask-question">
          Question
        </label>
        <Input
          id="ask-question"
          name="question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            hasArea
              ? "tonight, beginners, door code…"
              : "what should I expect at a meeting?"
          }
          autoComplete="off"
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>
          ask
        </Button>
      </form>
    </section>
  );
}
