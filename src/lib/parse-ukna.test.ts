import assert from "node:assert/strict";
import test from "node:test";
import { parseUknaHtml } from "./parse-ukna";
import { parseFeedMeetings } from "./parse-feed";

const html = `
<article>
  <h2><a href="/meeting/sunshine-meeting">Sunshine Meeting</a></h2>
  <div>Dorset Area</div>
  <div>Sunday</div>
  <div>10:30 ~ 12:00</div>
  <div>R-Hub</div>
  <div>Station Approach</div>
  <div>Bournemouth</div>
  <div>Dorset</div>
  <div>BH1 4NB</div>
</article>
<article>
  <h2><a href="/meeting/just-today-0">Just for Today</a></h2>
  <div>Kent Area</div>
  <div>Monday 13:15 ~ 14:15</div>
  <div>Mill Lane House</div>
  <div>Mill Lane</div>
  <div>Margate</div>
  <div>Kent</div>
  <div>CT9 1LB</div>
</article>
<article>
  <h2>Friday Feelings Meetings</h2>
  <div>Kent Area</div>
  <div>Friday</div>
  <div>18:00 ~ 19:30</div>
  <div>Wateringbury Village Hall</div>
  <div>147 Tonbridge Rd, Wateringbury,</div>
  <div>Kent ME18 5NL</div>
  <div>Wateringbury, Kent</div>
  <div>Kent</div>
  <div>ME18 5NL</div>
</article>
`;

test("UKNA search results keep the town rather than the county", () => {
  const meetings = parseUknaHtml(html).flatMap((item) =>
    parseFeedMeetings(item, "ukna-dorset", "na", "ukna"),
  );
  assert.equal(meetings.length, 3);
  const sunshine = meetings.find((meeting) => meeting.name === "Sunshine Meeting");
  assert.equal(sunshine?.day, 0);
  assert.equal(sunshine?.time, "10:30");
  assert.equal(sunshine?.endTime, "12:00");
  assert.equal(sunshine?.city, "Bournemouth");
  assert.equal(sunshine?.postalCode, "BH1 4NB");
  assert.equal(sunshine?.fellowship, "na");
  const margate = meetings.find((meeting) => meeting.name === "Just for Today");
  assert.equal(margate?.city, "Margate");
  assert.equal(margate?.day, 1);
  assert.equal(margate?.time, "13:15");
  assert.equal(margate?.endTime, "14:15");
  assert.equal(margate?.postalCode, "CT9 1LB");
  const wateringbury = meetings.find((meeting) => meeting.name === "Friday Feelings Meetings");
  assert.equal(wateringbury?.city, "Wateringbury");
  assert.equal(wateringbury?.postalCode, "ME18 5NL");
});
