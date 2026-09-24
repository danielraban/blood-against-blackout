import assert from "node:assert/strict";
import test from "node:test";
import { geocodeQueriesForMeeting, uniqueGeocodeQueries } from "./geocode-batch";

const base = {
  lat: null,
  lng: null,
  attendance: "in-person",
  formattedAddress: "1 Main St, Boston, MA",
  city: "Boston",
  state: "MA",
  country: "US",
  geohash4: null,
};

test("geocode queries cover a missing address and its city once", () => {
  assert.deepEqual(geocodeQueriesForMeeting(base), [
    "1 Main St, Boston, MA",
    "Boston, MA, US",
  ]);
  assert.deepEqual(
    uniqueGeocodeQueries([
      base,
      { ...base, formattedAddress: "1 Main St, Boston, MA" },
    ]),
    ["1 Main St, Boston, MA", "Boston, MA, US"],
  );
});

test("meetings that already have coordinates do not need a geocode lookup", () => {
  assert.deepEqual(
    geocodeQueriesForMeeting({ ...base, lat: 42.3, lng: -71.1, geohash4: "drt2" }),
    [],
  );
});

test("online meetings geocode only when they still need a city anchor", () => {
  assert.deepEqual(
    geocodeQueriesForMeeting({
      ...base,
      attendance: "online",
      formattedAddress: null,
      geohash4: "drt2",
    }),
    [],
  );
  assert.deepEqual(
    geocodeQueriesForMeeting({
      ...base,
      attendance: "online",
      formattedAddress: null,
    }),
    ["Boston, MA, US"],
  );
});
