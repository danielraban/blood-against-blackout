import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRegionHint,
  cityKey,
  collapseCitySuggestions,
  formatCitySuggestion,
  isUsableCityLabel,
  normalizeCountry,
  normalizePlaceFields,
} from "./location";
import type { City } from "./types";

test("normalizes common country variants", () => {
  assert.equal(normalizeCountry("USA"), "US");
  assert.equal(normalizeCountry("United Kingdom"), "GB");
  assert.equal(normalizeCountry("Brasil"), "BR");
});

test("uses a constrained feed region hint only for missing jurisdiction", () => {
  assert.deepEqual(applyRegionHint({ state: null, country: null }, "US-CA"), {
    state: "CA",
    country: "US",
  });
  assert.deepEqual(
    applyRegionHint({ state: "OR", country: "US" }, "US-CA"),
    { state: "OR", country: "US" },
  );
});

test("same-named cities in different jurisdictions have different keys", () => {
  const names = ["Richmond", "Melbourne", "Springfield", "Portland"];
  for (const city of names) {
    assert.notEqual(
      cityKey({ city, state: "CA", country: "US", geohash4: "9q8y" }),
      cityKey({ city, state: "VA", country: "US", geohash4: "dq8b" }),
    );
  }
});

test("missing-country city keys use a coarse geographic scope", () => {
  assert.notEqual(
    cityKey({ city: "Richmond", state: null, country: null, geohash4: "9q8y" }),
    cityKey({ city: "Richmond", state: null, country: null, geohash4: "dq8b" }),
  );
});

test("rejects labels that are not real cities", () => {
  assert.equal(isUsableCityLabel("Regional"), false);
  assert.equal(isUsableCityLabel("Online"), false);
  assert.equal(isUsableCityLabel("London"), true);
});

test("collapses nearby jurisdiction variants of the same city", () => {
  const london: City = {
    slug: "london-xx-gb",
    label: "London",
    state: null,
    country: "GB",
    lat: 51.5072,
    lng: -0.1276,
    geohash4: "gcpv",
    meetingCount: 638,
  };
  const rows = collapseCitySuggestions([
    london,
    {
      ...london,
      slug: "london-lon-gb",
      state: "LON",
      lat: 51.51,
      meetingCount: 319,
    },
  ]);
  assert.deepEqual(rows, [london]);
});

test("normalizes swapped and postal Brooklyn labels", () => {
  assert.deepEqual(
    normalizePlaceFields({
      city: "Brooklyn",
      neighborhood: null,
      state: "02 Downtown / Park Slope / Red Hook",
      postalCode: null,
      country: "US",
    }),
    {
      city: "Brooklyn",
      neighborhood: null,
      state: null,
      postalCode: null,
      country: "US",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "CT 06234",
      neighborhood: null,
      state: "Brooklyn",
      postalCode: null,
      country: "US",
    }),
    {
      city: "Brooklyn",
      neighborhood: null,
      state: "CT",
      postalCode: "06234",
      country: "US",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "NY 11206",
      neighborhood: null,
      state: "01 North Brooklyn",
      postalCode: null,
      country: "US",
    }),
    {
      city: "Brooklyn",
      neighborhood: "North Brooklyn",
      state: "NY",
      postalCode: "11206",
      country: "US",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "NY",
      neighborhood: null,
      state: "Brooklyn",
      postalCode: null,
      country: "US",
    }),
    {
      city: "Brooklyn",
      neighborhood: null,
      state: "NY",
      postalCode: null,
      country: "US",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "Brooklyn",
      neighborhood: null,
      state: "CT",
      postalCode: null,
      country: "US",
    }),
    {
      city: "Brooklyn",
      neighborhood: null,
      state: "CT",
      postalCode: null,
      country: "US",
    },
  );
});

test("keeps London GB and London Ontario distinct and maps boroughs", () => {
  assert.deepEqual(
    normalizePlaceFields({
      city: "Greater London",
      neighborhood: null,
      state: null,
      postalCode: "EC1A",
      country: "UK",
    }),
    {
      city: "London",
      neighborhood: null,
      state: null,
      postalCode: "EC1A",
      country: "GB",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "Camden",
      neighborhood: null,
      state: "London",
      postalCode: null,
      country: "GB",
    }),
    {
      city: "London",
      neighborhood: "Camden",
      state: null,
      postalCode: null,
      country: "GB",
    },
  );
  assert.deepEqual(
    normalizePlaceFields({
      city: "London",
      neighborhood: null,
      state: "ON",
      postalCode: null,
      country: "CA",
    }),
    {
      city: "London",
      neighborhood: null,
      state: "ON",
      postalCode: null,
      country: "CA",
    },
  );
});

test("formats neighborhood suggestions with the parent city", () => {
  assert.equal(
    formatCitySuggestion({
      slug: "park-slope-brooklyn-ny-us",
      label: "Park Slope",
      parentLabel: "Brooklyn",
      state: "NY",
      country: "US",
      lat: 40.67,
      lng: -73.98,
      geohash4: "dr5r",
      meetingCount: 12,
    }),
    "Park Slope, Brooklyn, NY, US",
  );
});

test("drops postal-code city rows from suggestions", () => {
  const rows = collapseCitySuggestions([
    {
      slug: "ny-11206-us",
      label: "NY 11206",
      state: "01 North Brooklyn",
      country: "US",
      lat: 40.7,
      lng: -73.94,
      geohash4: "dr5r",
      meetingCount: 11,
    },
    {
      slug: "brooklyn-ny-us",
      label: "Brooklyn",
      state: "NY",
      country: "US",
      lat: 40.678,
      lng: -73.944,
      geohash4: "dr5r",
      meetingCount: 91,
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Brooklyn"],
  );
});

test("keeps same-named cities that are geographically distinct", () => {
  const rows = collapseCitySuggestions([
    {
      slug: "springfield-il-us",
      label: "Springfield",
      state: "IL",
      country: "US",
      lat: 39.7817,
      lng: -89.6501,
      geohash4: "dp04",
      meetingCount: 20,
    },
    {
      slug: "springfield-ma-us",
      label: "Springfield",
      state: "MA",
      country: "US",
      lat: 42.1015,
      lng: -72.5898,
      geohash4: "drkz",
      meetingCount: 10,
    },
  ]);
  assert.equal(rows.length, 2);
});
