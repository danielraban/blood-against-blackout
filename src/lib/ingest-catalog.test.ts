import assert from "node:assert/strict";
import test from "node:test";
import { hashFeedCatalog } from "./ingest-catalog";

test("catalog hash is stable and changes when either source file changes", () => {
  const base = hashFeedCatalog("[]", "[]");
  assert.equal(hashFeedCatalog("[]", "[]"), base);
  assert.notEqual(hashFeedCatalog("[{}]", "[]"), base);
  assert.notEqual(hashFeedCatalog("[]", "[{}]"), base);
});
