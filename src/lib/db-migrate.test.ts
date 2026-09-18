import assert from "node:assert/strict";
import test from "node:test";
import { alreadyAppliedPrefix } from "./db-migrate";

test("alreadyAppliedPrefix records consecutive applied migrations only", () => {
  assert.equal(
    alreadyAppliedPrefix({
      hasFeedsTable: false,
      hasMeetingsVerifiedAt: false,
      hasMeetingsNeighborhood: false,
      hasPlaceCanonicalCache: false,
      hasFeedsEtag: false,
    }),
    0,
  );
  assert.equal(
    alreadyAppliedPrefix({
      hasFeedsTable: true,
      hasMeetingsVerifiedAt: false,
      hasMeetingsNeighborhood: false,
      hasPlaceCanonicalCache: false,
      hasFeedsEtag: false,
    }),
    1,
  );
  assert.equal(
    alreadyAppliedPrefix({
      hasFeedsTable: true,
      hasMeetingsVerifiedAt: true,
      hasMeetingsNeighborhood: true,
      hasPlaceCanonicalCache: true,
      hasFeedsEtag: false,
    }),
    3,
  );
  assert.equal(
    alreadyAppliedPrefix({
      hasFeedsTable: true,
      hasMeetingsVerifiedAt: true,
      hasMeetingsNeighborhood: true,
      hasPlaceCanonicalCache: true,
      hasFeedsEtag: true,
    }),
    4,
  );
});

test("alreadyAppliedPrefix stops at the first missing migration", () => {
  assert.equal(
    alreadyAppliedPrefix({
      hasFeedsTable: true,
      hasMeetingsVerifiedAt: false,
      hasMeetingsNeighborhood: true,
      hasPlaceCanonicalCache: true,
      hasFeedsEtag: true,
    }),
    1,
  );
});
