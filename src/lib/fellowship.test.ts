import assert from "node:assert/strict";
import test from "node:test";
import { asFeedFormat } from "./fellowship";

test("feed formats include OIAA", () => {
  assert.equal(asFeedFormat("oiaa"), "oiaa");
  assert.equal(asFeedFormat("bmlt"), "bmlt");
  assert.equal(asFeedFormat("aagb"), "aagb");
  assert.equal(asFeedFormat("aagb-region"), "aagb-region");
  assert.equal(asFeedFormat("cauk"), "cauk");
  assert.equal(asFeedFormat("ukna"), "ukna");
  assert.equal(asFeedFormat("nope"), "tsml");
});
