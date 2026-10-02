import assert from "node:assert/strict";
import test from "node:test";
import { READING_FELLOWSHIPS, READINGS } from "./readings";

test("readings catalog is https-only official links for each fellowship", () => {
  const fellowships = [...new Set(READINGS.map((reading) => reading.fellowship))].sort();
  assert.deepEqual(fellowships, [...READING_FELLOWSHIPS].sort());
  const hrefs = READINGS.map((reading) => reading.href);
  for (const href of hrefs) {
    assert.equal(new URL(href).protocol, "https:");
  }
  assert.equal(hrefs.length, new Set(hrefs).size);
});
