import assert from "node:assert/strict";
import test from "node:test";
import { parseCaukLocationsHtml } from "./parse-cauk-locations";
import { parseFeedMeetings } from "./parse-feed";

const html = `
<table>
  <tr><th>Day</th><th>Time</th><th>Meeting</th><th>Location</th><th>Formatted Address</th><th>Geographical Area</th><th>Sub-Region</th><th>Types</th><th>Latitude</th><th>Longitude</th></tr>
  <tr>
    <td>Tuesday</td>
    <td>19:30</td>
    <td><a href="/meetings/margate/">Margate Tuesday CA</a></td>
    <td>St John's Church Community Centre</td>
    <td>Victoria Rd, Margate CT9 1LN, UK</td>
    <td>Kent</td>
    <td></td>
    <td>Open, Wheelchair Access</td>
    <td>51.3834219</td>
    <td>1.3847172</td>
  </tr>
  <tr>
    <td>Monday</td>
    <td>07:00</td>
    <td>Embrace the Morning</td>
    <td>Online</td>
    <td>United Kingdom</td>
    <td>CAUK</td>
    <td></td>
    <td>Online Meeting, Open</td>
    <td>55.378051</td>
    <td>-3.435973</td>
  </tr>
  <tr>
    <td>Monday</td>
    <td>19:00</td>
    <td>On Awakening</td>
    <td>Community Centre</td>
    <td>Portland Rd, Hove BN3 5DR, UK</td>
    <td>Sussex</td>
    <td></td>
    <td>Open</td>
    <td>50.83</td>
    <td>-0.18</td>
  </tr>
  <tr>
    <td>Monday</td>
    <td>Noon</td>
    <td>Salford Monday</td>
    <td>Aliya Youth Project</td>
    <td>469 Bury New Rd, Salford M7 3ND, UK</td>
    <td>Manchester</td>
    <td></td>
    <td>Open</td>
    <td>53.5148</td>
    <td>-2.2690</td>
  </tr>
</table>
`;

test("the C.A. locations table keeps Margate and drops online and out-of-area rows", () => {
  const meetings = parseCaukLocationsHtml(html).flatMap((item) =>
    parseFeedMeetings(item, "cauk-south", "ca", "cauk"),
  );
  assert.equal(meetings.length, 1);
  const margate = meetings[0];
  assert.equal(margate?.name, "Margate Tuesday CA");
  assert.equal(margate?.day, 2);
  assert.equal(margate?.time, "19:30");
  assert.equal(margate?.city, "Margate");
  assert.equal(margate?.postalCode, "CT9 1LN");
  assert.equal(margate?.lat, 51.3834219);
  assert.equal(margate?.lng, 1.3847172);
  assert.equal(margate?.fellowship, "ca");
  assert.equal(margate?.attendance, "in-person");
  assert.ok(margate?.types.includes("O"));
  assert.ok(margate?.types.includes("X"));
});
