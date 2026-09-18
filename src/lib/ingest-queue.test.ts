import assert from "node:assert/strict";
import test from "node:test";
import { sortFeedsStaleFirst } from "./ingest-queue";

test("stale-first ingest prefers never-ok feeds, then oldest lastOkAt", () => {
  const ordered = sortFeedsStaleFirst([
    {
      id: "fresh",
      lastOkAt: new Date("2026-09-18T12:00:00Z"),
      lastAttemptAt: new Date("2026-09-18T12:00:00Z"),
    },
    {
      id: "never",
      lastOkAt: null,
      lastAttemptAt: null,
    },
    {
      id: "stale",
      lastOkAt: new Date("2026-09-16T12:00:00Z"),
      lastAttemptAt: new Date("2026-09-17T12:00:00Z"),
    },
  ]);
  assert.deepEqual(
    ordered.map((feed) => feed.id),
    ["never", "stale", "fresh"],
  );
});
