import assert from "node:assert/strict";
import test from "node:test";
import { mapClaimedFeedRow } from "./ingest-lease";

test("claimed feed rows keep lease and attempt timestamps", () => {
  const feed = mapClaimedFeedRow({
    id: "london",
    name: "London",
    url: "https://example.com/meetings.json",
    region_hint: "GB",
    fellowship: "aa",
    format: "tsml",
    status: "ok",
    last_attempt_at: "2026-09-18T12:00:00.000Z",
    last_ok_at: "2026-09-18T12:00:00.000Z",
    last_error: null,
    meeting_count: "12",
    etag: "abc",
    last_modified: "Wed, 18 Sep 2026 12:00:00 GMT",
    leased_until: "2026-09-24T16:06:00.000Z",
  });
  assert.equal(feed?.id, "london");
  assert.equal(feed?.meetingCount, 12);
  assert.equal(feed?.lastAttemptAt?.toISOString(), "2026-09-18T12:00:00.000Z");
  assert.equal(feed?.leasedUntil?.toISOString(), "2026-09-24T16:06:00.000Z");
});

test("incomplete claim rows are ignored", () => {
  assert.equal(mapClaimedFeedRow({ id: "london" }), null);
});
