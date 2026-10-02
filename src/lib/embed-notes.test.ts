import assert from "node:assert/strict";
import test from "node:test";
import {
  combineMeetingNotes,
  hashNoteContent,
  noteEmbeddingUpsertRows,
  planNoteEmbeddings,
} from "./embed-notes";

test("unchanged note hashes are skipped", () => {
  const content = combineMeetingNotes("Beginners welcome", "Buzzer on the left");
  assert.equal(content, "Beginners welcome\n\nBuzzer on the left");
  const contentHash = hashNoteContent(content ?? "");
  const plan = planNoteEmbeddings(
    [
      {
        feedId: "feed",
        slug: "same",
        notes: "Beginners welcome",
        locationNotes: "Buzzer on the left",
        geohash4: "gcpv",
      },
      {
        feedId: "feed",
        slug: "changed",
        notes: "New note",
        locationNotes: null,
        geohash4: "gcpv",
      },
      {
        feedId: "feed",
        slug: "fresh",
        notes: "Door code 9",
        locationNotes: null,
        geohash4: "gcpv",
      },
    ],
    [
      { feedId: "feed", slug: "same", contentHash },
      {
        feedId: "feed",
        slug: "changed",
        contentHash: hashNoteContent("Old note"),
      },
      { feedId: "feed", slug: "gone", contentHash: "stale" },
    ],
  );

  assert.deepEqual(
    plan.toEmbed.map((row) => row.slug).sort(),
    ["changed", "fresh"],
  );
  assert.deepEqual(plan.toDelete, [{ feedId: "feed", slug: "gone" }]);
});

test("blank notes are not embedded", () => {
  assert.equal(combineMeetingNotes("  ", ""), null);
  const plan = planNoteEmbeddings(
    [
      {
        feedId: "feed",
        slug: "empty",
        notes: "   ",
        locationNotes: "",
        geohash4: null,
      },
    ],
    [{ feedId: "feed", slug: "empty", contentHash: "old" }],
  );
  assert.deepEqual(plan.toEmbed, []);
  assert.deepEqual(plan.toDelete, [{ feedId: "feed", slug: "empty" }]);
});

test("embedding upserts skip missing vectors and keep chunk order", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const rows = noteEmbeddingUpsertRows(
    [
      {
        feedId: "feed",
        slug: "one",
        notes: "a",
        locationNotes: null,
        geohash4: "gcpv",
        contentHash: "hash-one",
      },
      {
        feedId: "feed",
        slug: "two",
        notes: "b",
        locationNotes: null,
        geohash4: null,
        contentHash: "hash-two",
      },
    ],
    [[0.1, 0.2]],
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.slug, "one");
  assert.deepEqual(rows[0]?.embedding, [0.1, 0.2]);
  assert.equal(rows[0]?.updatedAt, now);
});
