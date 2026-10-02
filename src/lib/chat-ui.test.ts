import assert from "node:assert/strict";
import test from "node:test";
import {
  ASK_SUGGESTIONS,
  filtersFromAskParts,
  listingKeysFromAskParts,
  mergeAskFilters,
} from "./chat-ui";
import { DEFAULT_FILTERS } from "./types";

test("Ask suggestions cover help, beginners, and door codes", () => {
  assert.deepEqual(
    ASK_SUGGESTIONS.map((item) => item.label),
    ["beginners tonight", "door code", "what should I expect"],
  );
});

test("listing keys come from completed meeting and note tool parts", () => {
  const keys = listingKeysFromAskParts([
    { type: "text", text: "here are two" },
    {
      type: "tool-searchMeetings",
      state: "output-available",
      toolCallId: "1",
      output: {
        meetings: [
          { feedId: "feed", slug: "one" },
          { feedId: "feed", slug: "two" },
        ],
      },
    },
    {
      type: "tool-searchNotes",
      state: "output-available",
      toolCallId: "2",
      output: { notes: [{ feedId: "feed", slug: "one" }, { feedId: "feed", slug: "door" }] },
    },
    {
      type: "tool-searchMeetings",
      state: "input-available",
      toolCallId: "3",
      output: { meetings: [{ feedId: "feed", slug: "pending" }] },
    },
  ]);
  assert.deepEqual(keys, [
    { feedId: "feed", slug: "one" },
    { feedId: "feed", slug: "two" },
    { feedId: "feed", slug: "door" },
  ]);
});

test("completed searchMeetings input becomes finder filters without touching radius", () => {
  const filters = filtersFromAskParts([
    {
      type: "tool-searchMeetings",
      state: "output-available",
      toolCallId: "1",
      input: { day: "today", types: ["BE"], timeWindow: "evening", query: "beginners" },
    },
  ]);
  assert.deepEqual(filters, {
    day: "today",
    types: ["BE"],
    timeWindow: "evening",
    query: "beginners",
  });
  assert.equal(
    mergeAskFilters(DEFAULT_FILTERS, filters ?? {}).radiusKm,
    DEFAULT_FILTERS.radiusKm,
  );
  assert.equal(filtersFromAskParts([{ type: "text", text: "no tools" }]), null);
});
