import assert from "node:assert/strict";
import test from "node:test";
import { mapsUrl } from "./actions";

test("Google Maps directions use coordinates only", () => {
  assert.equal(
    mapsUrl(51.514942, -0.096276),
    "https://www.google.com/maps/dir/?api=1&destination=51.514942%2C-0.096276",
  );
  assert.equal(mapsUrl(51.514942, -0.096276).includes("City Lunch"), false);
});
