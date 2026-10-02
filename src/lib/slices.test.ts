import assert from "node:assert/strict";
import test from "node:test";
import { capSliceMeetings, SLICE_MEETING_CAP } from "./slices";

test("slice meeting lists under the cap stay whole", () => {
  const meetings = [1, 2, 3];
  assert.deepEqual(capSliceMeetings(meetings, 3), {
    meetings,
    truncated: false,
  });
});

test("slice meeting lists over the cap are truncated", () => {
  const meetings = Array.from({ length: SLICE_MEETING_CAP + 2 }, (_, i) => i);
  const capped = capSliceMeetings(meetings);
  assert.equal(capped.meetings.length, SLICE_MEETING_CAP);
  assert.equal(capped.truncated, true);
  assert.equal(capped.meetings[0], 0);
  assert.equal(capped.meetings.at(-1), SLICE_MEETING_CAP - 1);
});
