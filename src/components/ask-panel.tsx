"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MeetingCard } from "@/components/meeting-card";
import type { ChatMeetingRef } from "@/lib/chat-request";
import { meetingKey } from "@/lib/chat-meetings";
import {
  ASK_SUGGESTIONS,
  askFilterCallId,
  filtersFromAskParts,
  listingKeysFromAskParts,
} from "@/lib/chat-ui";
import type { RankedMeeting } from "@/lib/search";
import type { SearchFilters } from "@/lib/types";

export function AskPanel({
  geohash,
  citySlug,
  meetings,
  listed,
  onFilters,
}: {
  geohash: string | null;
  citySlug?: string | null;
  meetings: ChatMeetingRef[];
  listed?: RankedMeeting[];
  onFilters?: (filters: Partial<SearchFilters>) => void;
}) {
  const [input, setInput] = useState("");
  const appliedFilters = useRef(new Set<string>());
  const hasArea = Boolean(geohash) || meetings.length > 0;
  const listedByKey = useMemo(
    () =>
      new Map(
        (listed ?? []).map((meeting) => [
          meetingKey(meeting.feedId, meeting.slug),
          meeting,
        ]),
      ),
    [listed],
  );
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

  useEffect(() => {
    if (!onFilters) return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const filters = filtersFromAskParts(message.parts);
      const callId = askFilterCallId(message.parts);
      if (!filters || !callId || appliedFilters.current.has(callId)) continue;
      appliedFilters.current.add(callId);
      onFilters(filters);
    }
  }, [messages, onFilters]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    void sendMessage({ text: question });
    setInput("");
  }

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
          const cards =
            message.role === "assistant"
              ? listingKeysFromAskParts(message.parts)
                  .map((item) => listedByKey.get(meetingKey(item.feedId, item.slug)))
                  .filter((meeting): meeting is RankedMeeting => Boolean(meeting))
              : [];
          if (!text && cards.length === 0) return null;
          return (
            <div key={message.id} className="space-y-2">
              <p className="text-sm font-semibold lowercase">
                {message.role === "user" ? "you" : "ask"}
              </p>
              {text ? <p className="whitespace-pre-wrap text-sm">{text}</p> : null}
              {cards.length ? (
                <ul className="space-y-2">
                  {cards.map((meeting) => (
                    <li key={meetingKey(meeting.feedId, meeting.slug)}>
                      <MeetingCard meeting={meeting} showDay />
                    </li>
                  ))}
                </ul>
              ) : null}
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
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {ASK_SUGGESTIONS.filter((item) => !item.needsArea || hasArea).map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => ask(item.text)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const text = String(new FormData(form).get("question") ?? "");
          ask(text);
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
