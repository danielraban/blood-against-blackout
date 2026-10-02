const BEGINNER_PHRASE = /\bbeginners? welcome\b/i;
const WHEELCHAIR_PHRASE = /\bwheelchair accessible\b/i;

function combinedNotes(notes: string | null | undefined, locationNotes?: string | null) {
  return [notes, locationNotes].filter(Boolean).join("\n");
}

export function notesNeedBeginnerType(types: readonly string[], notes: string | null | undefined) {
  if (!notes || !BEGINNER_PHRASE.test(notes)) return false;
  return !types.includes("BE") && !types.includes("B");
}

export function notesNeedWheelchairType(types: readonly string[], notes: string | null | undefined) {
  if (!notes || !WHEELCHAIR_PHRASE.test(notes)) return false;
  return !types.includes("X");
}

export function mergeNoteTypes(
  types: readonly string[],
  notes: string | null | undefined,
  locationNotes?: string | null,
) {
  const text = combinedNotes(notes, locationNotes);
  const next = [...types];
  if (notesNeedBeginnerType(next, text)) next.push("BE");
  if (notesNeedWheelchairType(next, text)) next.push("X");
  return next;
}
