import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBmltMeeting,
  parseFeedMeetings,
  parseTsmlMeeting,
  dedupeMeetingsBySlug,
  uniqueDaySlug,
} from "./parse-feed";

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

test("BMLT parser recovers Brooklyn municipality from messy area fields", () => {
  const downtown = parseBmltMeeting(
    {
      id_bigint: "10",
      meeting_name: "Downtown",
      weekday_tinyint: 2,
      start_time: "19:00",
      location_municipality: "Brooklyn",
      location_province: "02 Downtown / Park Slope / Red Hook",
      location_nation: "US",
      latitude: 40.67,
      longitude: -73.98,
    },
    "feed",
    "na",
  );
  assert.equal(downtown?.city, "Brooklyn");
  assert.equal(downtown?.neighborhood, null);
  assert.equal(downtown?.state, null);

  const north = parseBmltMeeting(
    {
      id_bigint: "11",
      meeting_name: "North",
      weekday_tinyint: 2,
      start_time: "19:00",
      location_municipality: "NY 11206",
      location_province: "01 North Brooklyn",
      location_nation: "US",
      latitude: 40.7,
      longitude: -73.94,
    },
    "feed",
    "na",
  );
  assert.equal(north?.city, "Brooklyn");
  assert.equal(north?.neighborhood, "North Brooklyn");
  assert.equal(north?.state, "NY");
  assert.equal(north?.postalCode, "11206");
});

test("TSML parser maps a London borough without collapsing Ontario", () => {
  const camden = parseTsmlMeeting(
    {
      id: "camden",
      name: "Camden",
      city: "Camden",
      state: "London",
      country: "UK",
      day: 1,
      time: "18:00",
      latitude: 51.54,
      longitude: -0.14,
    },
    "feed",
    "aa",
  );
  assert.equal(camden?.city, "London");
  assert.equal(camden?.neighborhood, "Camden");
  assert.equal(camden?.country, "GB");

  const ontario = parseTsmlMeeting(
    {
      id: "london-on",
      name: "London ON",
      city: "London",
      state: "ON",
      country: "CA",
      day: 1,
      time: "18:00",
      latitude: 42.98,
      longitude: -81.25,
    },
    "feed",
    "aa",
  );
  assert.equal(ontario?.city, "London");
  assert.equal(ontario?.state, "ON");
  assert.equal(ontario?.country, "CA");
  assert.equal(ontario?.neighborhood, null);
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

test("London zoom meetings with placeholder addresses stay online", () => {
  const meeting = parseTsmlMeeting(
    {
      name: "Late Night London",
      slug: "late-night-london-213000-onl-79735",
      day: 3,
      time: "21:30",
      timezone: "Europe/London",
      conference_url: "https://example.com/zoom",
      location: "",
      formatted_address: ",London,United Kingdom,",
      country: "UK",
      latitude: null,
      longitude: null,
    },
    "london-uk",
    "aa",
  );

  assert.equal(meeting?.attendance, "online");
  assert.equal(meeting?.city, "London");
  assert.equal(meeting?.lat, null);
  assert.ok(meeting?.types.includes("ONL"));
});

test("multi-day meetings keep distinct slugs when the base slug is already 64 characters", () => {
  const longSlug = "online-8am-aa-friday-under-richmond-bridge-great-at-eight-080000";
  assert.equal(longSlug.length, 64);
  assert.notEqual(uniqueDaySlug(longSlug, 0), uniqueDaySlug(longSlug, 1));
  assert.ok(uniqueDaySlug(longSlug, 0).length <= 64);
  const rows = parseFeedMeetings(
    {
      name: "Late Night London",
      slug: longSlug,
      day: [0, 1, 2],
      time: "21:30",
      conference_url: "https://example.com/zoom",
      formatted_address: ",London,United Kingdom,",
      country: "UK",
    },
    "london-uk",
    "aa",
    "tsml",
  );
  const slugs = rows.map((row) => row.slug);
  assert.deepEqual(new Set(slugs).size, 3);
  assert.ok(slugs.every((slug) => slug.length <= 64));
});

test("duplicate feed/slug rows collapse before insert", () => {
  const rows = dedupeMeetingsBySlug([
    { feedId: "london-uk", slug: "same", name: "first" },
    { feedId: "london-uk", slug: "same", name: "second" },
    { feedId: "london-uk", slug: "other", name: "other" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.slug === "same")?.name, "second");
});
