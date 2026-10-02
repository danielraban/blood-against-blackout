import assert from "node:assert/strict";
import test from "node:test";
import { CasingCache } from "drizzle-orm/casing";
import { meetings } from "./schema";
import { allowedPairPredicate } from "./chat-lookup";

function sqlText(
  fragment: ReturnType<typeof allowedPairPredicate>,
) {
  return fragment.toQuery({
    casing: new CasingCache(),
    escapeName: (name) => `"${name}"`,
    escapeParam: (num) => `$${num + 1}`,
    escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
    inlineParams: true,
  }).sql;
}

test("empty allowed set is false, not a 200-way OR", () => {
  assert.match(
    sqlText(allowedPairPredicate(meetings.feedId, meetings.slug, [])),
    /false/i,
  );
});

test("allowed meeting refs become a VALUES list", () => {
  const text = sqlText(
    allowedPairPredicate(meetings.feedId, meetings.slug, [
      { feedId: "feed-a", slug: "one", distanceKm: 1 },
      { feedId: "feed-b", slug: "two", distanceKm: 2 },
    ]),
  );
  assert.match(text, /in \(values/i);
  assert.match(text, /feed-a/);
  assert.match(text, /feed-b/);
  assert.doesNotMatch(text, /\bor\b/i);
});
