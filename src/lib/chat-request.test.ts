import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CHAT_BODY_BYTES,
  MAX_CHAT_MEETINGS,
  MAX_CHAT_MESSAGES,
  containsCoordinateFields,
  isChatBodyTooLarge,
  parseChatRequest,
} from "./chat-request";

const messages = [{ role: "user", parts: [{ type: "text", text: "hello" }] }];

test("rejects precise coordinates anywhere in the chat body", () => {
  assert.equal(containsCoordinateFields({ lat: 51.5, lng: -0.1 }), true);
  assert.equal(
    containsCoordinateFields({
      messages,
      meetings: [{ feedId: "feed", slug: "one", distanceKm: 2, latitude: 51.5 }],
    }),
    true,
  );
  assert.equal(
    parseChatRequest({
      messages,
      lat: 51.5,
      meetings: [{ feedId: "feed", slug: "one", distanceKm: 1 }],
    }).ok,
    false,
  );
  assert.equal(
    parseChatRequest({
      messages,
      meetings: [{ feedId: "feed", slug: "one", distanceKm: 1 }],
    }).ok,
    true,
  );
});

test("accepts a coarse geohash or city slug and rounded meeting ids", () => {
  const parsed = parseChatRequest({
    messages,
    geohash: "GCPV",
    citySlug: "london-england",
    meetings: [{ feedId: "qa-feed", slug: "qa-meeting", distanceKm: 1.4 }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.geohash, "gcpv");
  assert.equal(parsed.value.citySlug, "london-england");
  assert.deepEqual(parsed.value.meetings, [
    { feedId: "qa-feed", slug: "qa-meeting", distanceKm: 1 },
  ]);
});

test("rejects oversized chat payloads", () => {
  assert.equal(isChatBodyTooLarge(MAX_CHAT_BODY_BYTES), false);
  assert.equal(isChatBodyTooLarge(MAX_CHAT_BODY_BYTES + 1), true);
  assert.equal(
    parseChatRequest({
      messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => messages[0]),
    }).ok,
    false,
  );
  assert.equal(
    parseChatRequest({
      messages,
      meetings: Array.from({ length: MAX_CHAT_MEETINGS + 1 }, (_, index) => ({
        feedId: "feed",
        slug: `meeting-${index}`,
        distanceKm: 1,
      })),
    }).ok,
    false,
  );
});
