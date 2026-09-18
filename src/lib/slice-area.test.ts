import assert from "node:assert/strict";
import test from "node:test";
import {
  meetingBelongsToSlice,
  sliceAreaFromCities,
  type SliceCity,
} from "./slice-area";
import type { Meeting } from "./types";

const LONDON_NEIGHBORS = ["gcpv", "gcpu", "u10h"];

const londonCities: SliceCity[] = [
  {
    label: "London",
    parentLabel: "England",
    state: null,
    country: "GB",
  },
  {
    label: "Richmond",
    parentLabel: "London",
    state: null,
    country: "GB",
  },
  {
    label: "Camden",
    parentLabel: "London",
    state: null,
    country: "United Kingdom",
  },
];

const londonArea = sliceAreaFromCities(londonCities, LONDON_NEIGHBORS);

function online(overrides: Partial<Meeting> = {}): Pick<
  Meeting,
  "attendance" | "city" | "state" | "country" | "geohash4"
> {
  return {
    attendance: "online",
    city: "London",
    state: null,
    country: "GB",
    geohash4: null,
    ...overrides,
  };
}

test("London-area online meetings stay in a London slice", () => {
  assert.equal(meetingBelongsToSlice(online(), londonArea), true);
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", country: "United Kingdom" }),
      londonArea,
    ),
    true,
  );
  assert.equal(
    meetingBelongsToSlice(online({ city: "Camden", country: "UK" }), londonArea),
    true,
  );
});

test("same-named cities in other countries are not nearby", () => {
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", state: "VA", country: "US" }),
      londonArea,
    ),
    false,
  );
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", state: "NSW", country: "AU" }),
      londonArea,
    ),
    false,
  );
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Camden", state: "NJ", country: "US" }),
      londonArea,
    ),
    false,
  );
});

test("city-only online rows without a country do not qualify", () => {
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", country: null, geohash4: null }),
      londonArea,
    ),
    false,
  );
});

test("a local geohash still includes a meeting even without a country", () => {
  assert.equal(
    meetingBelongsToSlice(
      {
        attendance: "in-person",
        city: "Richmond",
        state: null,
        country: null,
        geohash4: "gcpv",
      },
      londonArea,
    ),
    true,
  );
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", country: null, geohash4: "gcpv" }),
      londonArea,
    ),
    true,
  );
});

test("US same-named cities stay scoped by state when local cities have one", () => {
  const richmondCa = sliceAreaFromCities(
    [
      {
        label: "Richmond",
        parentLabel: null,
        state: "CA",
        country: "US",
      },
    ],
    ["9q8y"],
  );
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", state: "CA", country: "US" }),
      richmondCa,
    ),
    true,
  );
  assert.equal(
    meetingBelongsToSlice(
      online({ city: "Richmond", state: "VA", country: "US" }),
      richmondCa,
    ),
    false,
  );
});
