import assert from "node:assert/strict";
import test from "node:test";
import { isSourceFresh } from "./verification";

const now = new Date("2026-09-16T12:00:00Z");

test("accepts a recently successful official source", () => {
  assert.equal(
    isSourceFresh("ok", "2026-09-15T12:00:01Z", now),
    true,
  );
});

test("rejects failed, missing, and expired source verification", () => {
  assert.equal(isSourceFresh("error", "2026-09-16T11:00:00Z", now), false);
  assert.equal(isSourceFresh("ok", null, now), false);
  assert.equal(
    isSourceFresh("ok", "2026-09-14T11:59:59Z", now),
    false,
  );
});
