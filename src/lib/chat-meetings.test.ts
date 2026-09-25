import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAllowedMeetings,
  meetingRefsForChat,
  searchAllowedMeetings,
  stripMeetingCoordinates,
} from "./chat-meetings";
import type { Meeting } from "./types";

const meeting: Meeting = {
  feedId: "feed",
  slug: "cafe-group",
  name: "Café Serenity",
  groupName: null,
  day: 3,
  time: "19:30",
  endTime: null,
  timezone: "Europe/London",
  types: ["O", "B"],
  attendance: "in-person",
  fellowship: "aa",
  locationName: "The Advent Centre",
  address: "10 High Street",
  city: "London",
  neighborhood: null,
  state: null,
  postalCode: null,
  country: "GB",
  formattedAddress: null,
  lat: 51.5072,
  lng: -0.1276,
  geohash4: "gcpv",
  conferenceUrl: null,
  conferencePhone: null,
  notes: "Beginners welcome. Door code 1234.",
  locationNotes: "Buzzer on the left",
  updatedAt: null,
  sourceVerifiedAt: null,
  entityId: null,
  entityName: null,
  entityPhone: null,
  entityEmail: null,
  entityUrl: null,
  feedbackEmails: [],
};

test("meeting refs stay inside the radius and round distance to whole km", () => {
  const nearby = meetingRefsForChat(
    [
      meeting,
      {
        ...meeting,
        slug: "far-group",
        lat: 52.2,
        lng: 0.1,
      },
    ],
    { lat: 51.5072, lng: -0.1276 },
    15,
  );
  assert.deepEqual(nearby, [
    { feedId: "feed", slug: "cafe-group", distanceKm: 0 },
  ]);
});

test("stripMeetingCoordinates removes lat and lng and adds a listing href", () => {
  const stripped = stripMeetingCoordinates(meeting, 3);
  assert.equal("lat" in stripped, false);
  assert.equal("lng" in stripped, false);
  assert.equal(stripped.distanceKm, 3);
  assert.equal(stripped.href, "/meetings/feed/cafe-group");
  assert.equal(stripped.notes, meeting.notes);
});

test("searchAllowedMeetings never returns meetings outside the allowed id set", () => {
  const outsider = { ...meeting, slug: "other-group", name: "Other Group" };
  const allowed = [{ feedId: "feed", slug: "cafe-group", distanceKm: 2 }];
  assert.deepEqual(filterAllowedMeetings([meeting, outsider], allowed), [meeting]);
  const results = searchAllowedMeetings([meeting, outsider], allowed, {
    day: "any",
    week: true,
    query: "beginners",
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.slug, "cafe-group");
  assert.equal(results[0]?.distanceKm, 2);
  assert.equal("lat" in (results[0] ?? {}), false);
});
