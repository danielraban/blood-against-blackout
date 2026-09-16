import assert from "node:assert/strict";
import test from "node:test";
import { parseBmltMeeting, parseTsmlMeeting } from "./parse-feed";

test("TSML region is not incorrectly used as the city", () => {
  const meeting = parseTsmlMeeting(
    {
      id: "1",
      name: "Example",
      day: 2,
      time: "19:00",
      region: "South Midlands",
      formatted_address: "10 High Street, Oxford, OX1 1AA, UK",
      latitude: 51.75,
      longitude: -1.25,
    },
    "feed",
    "aa",
  );

  assert.equal(meeting?.city, "Oxford");
  assert.equal(meeting?.state, "South Midlands");
});

test("invalid source coordinates are discarded", () => {
  const meeting = parseTsmlMeeting(
    {
      id: "2",
      name: "Example",
      city: "London",
      day: 3,
      time: "20:00",
      latitude: 151,
      longitude: -220,
    },
    "feed",
    "aa",
  );

  assert.equal(meeting?.lat, null);
  assert.equal(meeting?.lng, null);
});

test("city duplicated into the region field is not retained as state", () => {
  const meeting = parseTsmlMeeting(
    {
      id: "same-region",
      name: "Example",
      city: "Richmond",
      region: "RICHMOND",
      day: 1,
      time: "18:00",
      latitude: 37.54,
      longitude: -77.44,
    },
    "feed",
    "aa",
  );

  assert.equal(meeting?.state, null);
});

test("BMLT parser normalizes jurisdiction values", () => {
  const meeting = parseBmltMeeting(
    {
      id_bigint: "3",
      meeting_name: "Recovery",
      weekday_tinyint: 4,
      start_time: "18:30",
      location_municipality: "Portland",
      location_province: "or",
      location_nation: "USA",
      latitude: 45.52,
      longitude: -122.68,
    },
    "feed",
    "na",
  );

  assert.equal(meeting?.city, "Portland");
  assert.equal(meeting?.state, "OR");
  assert.equal(meeting?.country, "US");
});
