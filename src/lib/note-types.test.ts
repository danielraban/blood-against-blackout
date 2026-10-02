import assert from "node:assert/strict";
import test from "node:test";
import { mergeNoteTypes, notesNeedBeginnerType, notesNeedWheelchairType } from "./note-types";

test("notes yield beginner and wheelchair types only from fail-closed phrases", () => {
  assert.deepEqual(
    mergeNoteTypes(["O"], "Beginners welcome. Door code 12.", null),
    ["O", "BE"],
  );
  assert.deepEqual(
    mergeNoteTypes([], null, "Wheelchair accessible entrance"),
    ["X"],
  );
  assert.deepEqual(mergeNoteTypes(["BE"], "Beginners welcome", null), ["BE"]);
  assert.deepEqual(mergeNoteTypes(["O"], "Not a beginners meeting", null), ["O"]);
  assert.deepEqual(mergeNoteTypes(["O"], "maybe a beginner someday", null), ["O"]);
});

test("audit helpers flag notes that still lack the matching type", () => {
  assert.equal(notesNeedBeginnerType(["O"], "Beginners welcome"), true);
  assert.equal(notesNeedBeginnerType(["BE"], "Beginners welcome"), false);
  assert.equal(notesNeedWheelchairType([], "Wheelchair accessible"), true);
  assert.equal(notesNeedWheelchairType(["X"], "Wheelchair accessible"), false);
});
