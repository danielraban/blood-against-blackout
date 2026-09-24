import assert from "node:assert/strict";
import test from "node:test";
import {
  borrowVenueCoordinates,
  geocodeQueriesForMeeting,
  postcodeGeocodeQuery,
  uniqueGeocodeQueries,
} from "./geocode-batch";

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

test("in-person rows with a postcode geocode the postcode rather than the raw address", () => {
  const meeting = {
    ...base,
    locationName: "Canal Club Community Centre",
    postalCode: "E2 9HP",
    city: "London",
    state: "LON",
    country: "GB",
    formattedAddress:
      "Belmont Wharf, Waterloo Gdns, Bethnal Green, London, United Kingdom, E2 9HP",
  };
  assert.equal(postcodeGeocodeQuery(meeting), "E2 9HP, London, GB");
  assert.deepEqual(geocodeQueriesForMeeting(meeting), ["E2 9HP, London, GB"]);
});

test("a venue pin is copied only when the location and postcode match", () => {
  const sunday = {
    ...base,
    locationName: "Canal Club Community Centre",
    postalCode: "E2 9HP",
    lat: 51.534242,
    lng: -0.052311,
    geohash4: "gcpv",
  };
  const thursday = {
    ...sunday,
    lat: null,
    lng: null,
    geohash4: null,
  };
  const otherBuilding = {
    ...thursday,
    locationName: "St Peter's Church Bethnal Green",
  };
  const [borrowedThursday, untouched] = borrowVenueCoordinates([
    sunday,
    thursday,
    otherBuilding,
  ]).slice(1);
  assert.equal(borrowedThursday?.lat, 51.534242);
  assert.equal(borrowedThursday?.lng, -0.052311);
  assert.equal(untouched?.lat, null);
  assert.equal(untouched?.lng, null);
});

test("placeholder online rows are not address-geocoded", () => {
  assert.deepEqual(
    geocodeQueriesForMeeting({
      ...base,
      attendance: "online",
      formattedAddress: ",London,United Kingdom,",
      city: "London",
      state: "LON",
      country: "GB",
      postalCode: null,
      geohash4: "gcpv",
    }),
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
