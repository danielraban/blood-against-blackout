import assert from "node:assert/strict";
import test from "node:test";
import {
  clonePlaceBudget,
  mergeIngestStats,
  runWithConcurrency,
  sortFeedsStaleFirst,
} from "./ingest-queue";

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

test("place budgets are cloned so parallel workers cannot share remaining counts", () => {
  const shared = { reverse: 12, ai: 25 };
  const left = clonePlaceBudget(shared);
  const right = clonePlaceBudget(shared);
  left.ai -= 3;
  right.reverse -= 1;
  assert.deepEqual(shared, { reverse: 12, ai: 25 });
  assert.deepEqual(left, { reverse: 12, ai: 22 });
  assert.deepEqual(right, { reverse: 11, ai: 25 });
});

test("ingest stats merge numeric counters and errors", () => {
  const into = {
    feedsClaimed: 2,
    feedsProcessed: 2,
    feedsOk: 1,
    feedsFail: 1,
    feedsNotModified: 0,
    feedsWritten: 1,
    meetingsUpserted: 10,
    budgetExhausted: 0,
    feedsBehindFreshness: 3,
    errors: ["a"],
  };
  mergeIngestStats(into, {
    feedsClaimed: 0,
    feedsProcessed: 1,
    feedsOk: 1,
    feedsFail: 0,
    feedsNotModified: 1,
    feedsWritten: 0,
    meetingsUpserted: 4,
    budgetExhausted: 2,
    feedsBehindFreshness: 0,
    errors: ["b"],
  });
  assert.equal(into.feedsOk, 2);
  assert.equal(into.meetingsUpserted, 14);
  assert.equal(into.budgetExhausted, 2);
  assert.deepEqual(into.errors, ["a", "b"]);
});
