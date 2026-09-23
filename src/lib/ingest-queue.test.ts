import assert from "node:assert/strict";
import test from "node:test";
import { sortFeedsStaleFirst } from "./ingest-queue";

test("stale-first ingest prefers never-attempted feeds, then oldest lastAttemptAt", () => {
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

test("recently failed feeds do not starve healthy feeds that have not been attempted", () => {
  const ordered = sortFeedsStaleFirst([
    {
      id: "broken",
      lastOkAt: new Date("2026-09-16T12:00:00Z"),
      lastAttemptAt: new Date("2026-09-23T08:00:00Z"),
    },
    {
      id: "healthy",
      lastOkAt: new Date("2026-09-18T12:00:00Z"),
      lastAttemptAt: new Date("2026-09-18T12:00:00Z"),
    },
  ]);
  assert.deepEqual(
    ordered.map((feed) => feed.id),
    ["healthy", "broken"],
  );
});
