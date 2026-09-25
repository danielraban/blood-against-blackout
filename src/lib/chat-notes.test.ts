import assert from "node:assert/strict";
import test from "node:test";
import { rankNoteHits } from "./chat-notes";

const query = [1, 0, 0, 0];

test("note search stays inside the allowed meeting ids", () => {
  const hits = rankNoteHits(
    query,
    [
      {
        feedId: "feed",
        slug: "allowed",
        name: "Allowed",
        notes: "Beginners room",
        locationNotes: "Door code 12",
        embedding: [0.9, 0.1, 0, 0],
      },
      {
        feedId: "feed",
        slug: "outside",
        name: "Outside",
        notes: "Even closer beginners text",
        locationNotes: null,
        embedding: [1, 0, 0, 0],
      },
    ],
    [{ feedId: "feed", slug: "allowed", distanceKm: 1 }],
  );

  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.slug, "allowed");
  assert.equal(hits[0]?.href, "/meetings/feed/allowed");
  assert.equal("lat" in (hits[0] ?? {}), false);
  assert.ok((hits[0]?.score ?? 0) > 0.3);
});
