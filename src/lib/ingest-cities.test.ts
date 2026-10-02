import assert from "node:assert/strict";
import test from "node:test";
import { cityRebuildPlan } from "./ingest-cities";

test("city rebuild is full when the cities marker is dirty", () => {
  assert.deepEqual(cityRebuildPlan(true, []), { mode: "full" });
  assert.deepEqual(cityRebuildPlan(true, ["feed-a"]), { mode: "full" });
});

test("city rebuild is incremental when feeds were written and the marker is clean", () => {
  assert.deepEqual(cityRebuildPlan(false, ["feed-a", "feed-b"]), {
    mode: "incremental",
    feedIds: ["feed-a", "feed-b"],
  });
});

test("city rebuild is skipped when the marker is clean and no feeds were written", () => {
  assert.deepEqual(cityRebuildPlan(false, []), { mode: "skip" });
});
