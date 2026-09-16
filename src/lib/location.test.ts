import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRegionHint,
  cityKey,
  collapseCitySuggestions,
  isUsableCityLabel,
  normalizeCountry,
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
