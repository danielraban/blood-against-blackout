import assert from "node:assert/strict";
import test from "node:test";
import { filterAndGroup, weekGroupTitle } from "./search";
import { DEFAULT_FILTERS, type Meeting } from "./types";

const meeting: Meeting = {
  feedId: "feed",
  slug: "cafe-group",
  name: "Café Serenity",
  groupName: null,
  day: null,
  time: null,
  endTime: null,
  timezone: null,
  types: ["ONL"],
  attendance: "online",
  fellowship: "aa",
  locationName: null,
  address: "10 High Street",
  city: "Oxford",
  neighborhood: null,
  state: null,
  postalCode: null,
  country: "GB",
  formattedAddress: null,
  lat: null,
  lng: null,
  geohash4: null,
  conferenceUrl: null,
  conferencePhone: null,
  notes: null,
  locationNotes: null,
  updatedAt: null,
  sourceVerifiedAt: null,
  entityId: null,
  entityName: null,
  entityPhone: null,
  entityEmail: null,
  entityUrl: null,
  feedbackEmails: [],
};

const LONDON = { lat: 51.5072, lng: -0.1276 };
const WEDNESDAY_20_LONDON = new Date("2026-09-16T19:00:00.000Z");
const WEDNESDAY = 3;

function search(query: string) {
  return filterAndGroup(
    [meeting],
    { ...DEFAULT_FILTERS, day: "any", week: true, query },
    null,
  ).count;
}

test("meeting search ignores accents and extra whitespace", () => {
  assert.equal(search("  cafe   serenity "), 1);
});

test("meeting search matches words across fields and type codes", () => {
  assert.equal(search("Oxford ONL"), 1);
});

test("duplicate listings of the same meeting are collapsed", () => {
  const result = filterAndGroup(
    [
      {
        ...meeting,
        feedId: "london-central",
        slug: "first-london",
        name: "First London",
        day: 3,
        time: "19:30",
        attendance: "in-person",
        locationName: "The Advent Centre",
        city: "London",
      },
      {
        ...meeting,
        feedId: "london-west",
        slug: "first-london-copy",
        name: "First London",
        day: 3,
        time: "19:30",
        attendance: "in-person",
        locationName: "The Advent Centre",
        city: "London",
      },
    ],
    { ...DEFAULT_FILTERS, day: "any", week: true },
    null,
  );
  assert.equal(result.count, 1);
});

test("distinct meetings at the same time are kept", () => {
  const result = filterAndGroup(
    [
      {
        ...meeting,
        slug: "eaton-square",
        name: "Eaton Square Newcomers at 8",
        day: 3,
        time: "20:00",
        attendance: "in-person",
        locationName: "St Peter's Church",
      },
      {
        ...meeting,
        slug: "soho",
        name: "Soho Newcomers",
        day: 3,
        time: "20:00",
        attendance: "in-person",
        locationName: "St Anne's Church",
      },
    ],
    { ...DEFAULT_FILTERS, day: "any", week: true },
    null,
  );
  assert.equal(result.count, 2);
});

test("a meeting that already ended today is not shown as later today", () => {
  const result = filterAndGroup(
    [{ ...meeting, day: WEDNESDAY, time: "07:00", endTime: "08:00" }],
    DEFAULT_FILTERS,
    LONDON,
    WEDNESDAY_20_LONDON,
  );
  assert.equal(result.count, 0);
  assert.equal(result.groups.later.length, 0);
});

test("week results expose calendar day offsets for day-based headings", () => {
  const result = filterAndGroup(
    [{ ...meeting, day: (WEDNESDAY + 1) % 7, time: "19:00" }],
    { ...DEFAULT_FILTERS, day: "any", week: true },
    LONDON,
    WEDNESDAY_20_LONDON,
  );
  assert.equal(result.groups.week[0]?.daysUntil, 1);
});

test("remaining meetings later today stay visible until midnight", () => {
  const result = filterAndGroup(
    [
      { ...meeting, slug: "now", day: WEDNESDAY, time: "19:30", endTime: "20:30" },
      { ...meeting, slug: "tonight", day: WEDNESDAY, time: "23:15" },
    ],
    DEFAULT_FILTERS,
    LONDON,
    WEDNESDAY_20_LONDON,
  );
  assert.equal(result.groups.happening[0]?.slug, "now");
  assert.equal(result.groups.later[0]?.slug, "tonight");
  assert.equal(result.groups.later[0]?.daysUntil, 0);
});

test("after a location search, later today and upcoming days are both included", () => {
  const result = filterAndGroup(
    [
      { ...meeting, slug: "tonight", day: WEDNESDAY, time: "23:00" },
      { ...meeting, slug: "tomorrow", day: (WEDNESDAY + 1) % 7, time: "19:00" },
    ],
    { ...DEFAULT_FILTERS, week: true },
    LONDON,
    WEDNESDAY_20_LONDON,
  );
  assert.equal(result.groups.later[0]?.slug, "tonight");
  assert.equal(result.groups.week[0]?.slug, "tomorrow");
});

test("US meetings labeled UTC still use local American wall time", () => {
  const now = new Date("2026-09-16T20:01:00.000Z");
  const brooklyn = { lat: 40.6782, lng: -73.9442 };
  const result = filterAndGroup(
    [
      {
        ...meeting,
        slug: "evening",
        name: "The Ultimate Weapon",
        day: 3,
        time: "20:00",
        timezone: "UTC",
        attendance: "online",
        city: "New York",
        state: "NY",
        country: "US",
        lat: 40.71,
        lng: -74,
      },
      {
        ...meeting,
        slug: "afternoon",
        name: "Greenwood",
        day: 3,
        time: "15:30",
        timezone: "America/New_York",
        attendance: "in-person",
        city: "Brooklyn",
        country: "US",
        lat: 40.67,
        lng: -73.94,
      },
    ],
    DEFAULT_FILTERS,
    brooklyn,
    now,
  );
  assert.deepEqual(
    result.groups.happening.map((item) => item.slug),
    ["afternoon"],
  );
  assert.equal(result.groups.later[0]?.slug, "evening");
});

test("nearby drops online meetings whose coordinates are outside the radius", () => {
  const result = filterAndGroup(
    [
      {
        ...meeting,
        slug: "richmond-va",
        name: "NDANA Policy Subcommittee",
        city: "Richmond",
        state: "VA",
        country: "US",
        lat: 37.5407,
        lng: -77.436,
      },
      {
        ...meeting,
        slug: "london-zoom",
        name: "Lombard Street @ 6am",
        city: "London",
        country: "GB",
        lat: null,
        lng: null,
      },
    ],
    { ...DEFAULT_FILTERS, day: "any", week: true },
    LONDON,
    WEDNESDAY_20_LONDON,
  );
  assert.equal(result.count, 1);
  assert.equal(result.groups.week[0]?.slug, "london-zoom");
});

test("week group headings use today instead of a weekday name", () => {
  assert.equal(weekGroupTitle(0, 5), "today");
  assert.equal(weekGroupTitle(1, 6), "tomorrow");
  assert.equal(weekGroupTitle(7, 5), "next fri");
  assert.equal(weekGroupTitle(3, 1), "mon");
});
