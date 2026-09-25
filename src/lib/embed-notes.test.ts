import assert from "node:assert/strict";
import test from "node:test";
import {
  combineMeetingNotes,
  hashNoteContent,
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
