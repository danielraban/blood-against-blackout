import assert from "node:assert/strict";
import test from "node:test";
import { capSliceMeetings, omitSliceListFields, SLICE_MEETING_CAP } from "./slices";

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

test("slice lists drop notes that meeting detail still carries", () => {
  const pruned = omitSliceListFields({
    feedId: "feed",
    slug: "one",
    name: "Meeting",
    groupName: null,
    day: 1,
    time: "19:00",
    endTime: null,
    timezone: "Europe/London",
    types: [],
    attendance: "in-person",
    fellowship: "aa",
    locationName: null,
    address: null,
    city: "London",
    neighborhood: null,
    state: null,
    postalCode: null,
    country: "GB",
    formattedAddress: null,
    lat: 51.5,
    lng: -0.1,
    geohash4: "gcpv",
    conferenceUrl: null,
    conferencePhone: null,
    notes: "Door code 9",
    locationNotes: "Buzzer",
    updatedAt: null,
    sourceVerifiedAt: null,
    entityId: null,
    entityName: null,
    entityPhone: null,
    entityEmail: null,
    entityUrl: null,
    feedbackEmails: ["group@example.test"],
  });
  assert.equal(pruned.notes, null);
  assert.equal(pruned.locationNotes, null);
  assert.deepEqual(pruned.feedbackEmails, []);
  assert.equal(pruned.name, "Meeting");
});
