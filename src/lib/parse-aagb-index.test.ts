import assert from "node:assert/strict";
import test from "node:test";
import {
  aagbIntergroupHomes,
  aagbIntergroupSlug,
  aagbMeetingListLinks,
  isBotChallenge,
} from "./parse-aagb-index";

const region = `
<h3>Bournemouth &amp; District Intergroup</h3>
<p>In person meetings. <a href="https://www.alcoholics-anonymous.org.uk/intergroups/bournemouth-district-intergroup/">Find out more</a></p>
<h3>Cornwall Intergroup</h3>
<p><a href="/intergroups/cornwall-intergroup/">Find out more</a></p>
<p><a href="https://www.alcoholics-anonymous.org.uk/events/bournemouth-district-intergroup-convention/">Convention</a></p>
`;

test("the South West region page yields intergroup homes and skips events", () => {
  const homes = aagbIntergroupHomes(
    region,
    "https://www.alcoholics-anonymous.org.uk/regions/south-west-region/",
  );
  assert.deepEqual(
    homes.map((home) => home.id),
    ["aa-bournemouth-district-intergroup", "aa-cornwall-intergroup"],
  );
  assert.equal(homes[0]?.name, "Bournemouth & District Intergroup");
  assert.equal(homes[1]?.name, "Cornwall Intergroup");
  assert.equal(
    aagbIntergroupSlug(homes[0]?.url ?? ""),
    "bournemouth-district-intergroup",
  );
});

test("an intergroup home with no meetings points at the in-person child page", () => {
  const html = `
    <h1>Bournemouth & District Intergroup</h1>
    <a href="/intergroups/bournemouth-district-intergroup/in-person-meetings/">In Person Meetings</a>
    <a href="/intergroups/bournemouth-district-intergroup/online-meetings/">Online Meetings</a>
    <a href="/intergroups/bournemouth-district-intergroup/intergroup-meetings/">Intergroup Meetings</a>
    <a href="https://example.com/in-person-meetings/">Elsewhere</a>
  `;
  assert.deepEqual(
    aagbMeetingListLinks(
      html,
      "https://www.alcoholics-anonymous.org.uk/intergroups/bournemouth-district-intergroup/",
    ),
    [
      "https://www.alcoholics-anonymous.org.uk/intergroups/bournemouth-district-intergroup/in-person-meetings/",
    ],
  );
});

test("a Cloudflare challenge page is not a meeting list", () => {
  assert.equal(isBotChallenge("<title>Just a moment...</title>"), true);
  assert.equal(isBotChallenge("<h3>Monday</h3>"), false);
});
