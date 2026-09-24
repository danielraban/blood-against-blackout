import assert from "node:assert/strict";
import test from "node:test";
import { runWithConcurrency, sortFeedsStaleFirst } from "./ingest-queue";

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

test("concurrency pool leaves untaken work when the budget closes", async () => {
  const started: number[] = [];
  let active = 0;
  let maxActive = 0;
  let taken = 0;
  const leftover = await runWithConcurrency(
    [1, 2, 3, 4, 5, 6],
    2,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
    },
    () => {
      if (taken >= 3) return false;
      taken += 1;
      return true;
    },
  );
  assert.ok(maxActive <= 2);
  assert.deepEqual(started, [1, 2, 3]);
  assert.deepEqual(leftover, [4, 5, 6]);
});
