import assert from "node:assert/strict";
import test from "node:test";
import { asFeedFormat } from "./fellowship";

test("feed formats include OIAA", () => {
  assert.equal(asFeedFormat("oiaa"), "oiaa");
  assert.equal(asFeedFormat("bmlt"), "bmlt");
  assert.equal(asFeedFormat("nope"), "tsml");
});
