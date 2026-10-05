import assert from "node:assert/strict";
import test from "node:test";
import { sliceLoadStatus } from "./slice-loader";
import type { SlicePayload } from "./types";

function payload(meetings: SlicePayload["meetings"], truncated = false): SlicePayload {
  return {
    geohash: "gcpv",
    neighbors: [],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    meetings,
    sourceFeeds: [],
    truncated,
  };
}

test("slice load status names an empty area", () => {
  assert.equal(
    sliceLoadStatus(payload([])),
    "No listings cover this area yet",
  );
});

test("slice load status names a capped list", () => {
  assert.match(
    sliceLoadStatus(payload([{ } as SlicePayload["meetings"][number]], true)),
    /capped/,
  );
});
