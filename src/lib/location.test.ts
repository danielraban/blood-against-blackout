import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRegionHint,
  cityKey,
  isUsableCityLabel,
  normalizeCountry,
} from "./location";

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
