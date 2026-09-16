import assert from "node:assert/strict";
import test from "node:test";
import { filterAndGroup } from "./search";
import { DEFAULT_FILTERS, type Meeting } from "./types";

const meeting: Meeting = {
  feedId: "feed",
  slug: "cafe-group",
  name: "Café Serenity",
  groupName: null,
  day: null,
  time: null,
  endTime: null,
  timezone: null,
  types: ["ONL"],
  attendance: "online",
  fellowship: "aa",
  locationName: null,
  address: "10 High Street",
  city: "Oxford",
  state: null,
  postalCode: null,
  country: "GB",
  formattedAddress: null,
  lat: null,
  lng: null,
  geohash4: null,
  conferenceUrl: null,
  conferencePhone: null,
  notes: null,
  locationNotes: null,
  updatedAt: null,
  sourceVerifiedAt: null,
  entityId: null,
  entityName: null,
  entityPhone: null,
  entityEmail: null,
  entityUrl: null,
  feedbackEmails: [],
};

function search(query: string) {
  return filterAndGroup(
    [meeting],
    { ...DEFAULT_FILTERS, day: "any", week: true, query },
    null,
  ).count;
}

test("meeting search ignores accents and extra whitespace", () => {
  assert.equal(search("  cafe   serenity "), 1);
});

test("meeting search matches words across fields and type codes", () => {
  assert.equal(search("Oxford ONL"), 1);
});
