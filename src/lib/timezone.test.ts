import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMeetingTimeZone,
  timezoneFromCoords,
} from "./timezone";

test("Brooklyn coordinates resolve to Eastern Time", () => {
  assert.equal(timezoneFromCoords(40.6782, -73.9442), "America/New_York");
});

test("UTC timezone on a New York meeting is replaced with Eastern Time", () => {
  assert.equal(
    resolveMeetingTimeZone({
      timezone: "UTC",
      lat: 40.71,
      lng: -74,
      country: "US",
      state: "NY",
    }),
    "America/New_York",
  );
});
