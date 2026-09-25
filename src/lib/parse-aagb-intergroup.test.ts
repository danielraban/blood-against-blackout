import assert from "node:assert/strict";
import test from "node:test";
import { parseAagbIntergroupHtml, parseAagbPrintText } from "./parse-aagb-intergroup";
import { parseFeedMeetings } from "./parse-feed";

const html = `
<h3><strong><span>SUNDAY</span></strong></h3>
<p><b>Bournemouth St Swithun’s ♿&nbsp; <strong>✉</strong></b><br>
The Tudor Hall, St Swithun’s Church, Gervis Road, Bournemouth<br>
Time: 1.30pm, Duration: 1 Hour 15 mins <em>(doors open @ 1pm)</em><br>
<i>1</i><i>st</i><i> Sunday of each month is ‘Open’. All other weeks are ‘Closed’</i><br>
Postcode: BH1 3ED.</p>
<p><b>Winton Methodist Church Hall ♿&nbsp;</b><br>
125 Alma Road, Winton, Bournemouth<br>
Time: 8pm, Duration: 1 Hour 15 mins<br>
<i>Last Sunday of month is ‘Open’. All other weeks are ‘Closed’</i><br>
Postcode: BH9 1DE</p>
<h3><strong><span>TUESDAY</span></strong></h3>
<p><b>Christchurch Women in Recovery ♿</b><br>
St Joseph’s Church Hall, 67 Purewell. Christchurch<br>
Time: 12.30,&nbsp; Duration: 1 Hour 15 mins<br>
<i>All meetings are ‘Open’</i><br>
Postcode: BH23 1EH</p>
<p><b>Kinson AA – There Is A Solution</b><b> ♿ <strong>✉</strong><br>
</b>St Andrew’s Church, Millhams Road, Kinson, Bournemouth<br>
Time: 7.30pm,&nbsp; Duration: 1 Hour 15 mins<br>
<i>Last Friday of each month is ‘Open’. All other weeks are ‘Closed’</i><br>
Postcode: BH10 7LN</p>
<h3><strong><span>WEDNESDAY</span></strong></h3>
<p><strong>Bournemouth Young Persons AA ♿ <span>!*NEW ADDRESS!*</span></strong><br>
Boscombe Baptist Church Hall, 26 Palmerston Road, Boscombe, Bournemouth.<br>
Time: 7pm, Duration: 1 Hour 30 mins<br>
<em>All meetings are ‘Open’. Ages 30 and younger.</em><br>
Postcode: <strong>BH1 4HS</strong></p>
<h3><strong><span>FRIDAY</span></strong></h3>
<p><b>Christchurch The Steps We Took Friday ♿</b><br>
St Joseph’s Church, 67 Purewell, Christchurch<br>
Time: 12.00,&nbsp; Duration: 1 Hour 15 mins<br>
Postcode: BH23</p>
<p><b>Westbourne Women’s Steps &amp; Traditions Meeting ♿</b><br>
Westbourne Baptist Church, Poole Road, Bournemouth<br>
Time: 12.30, Duration: 1 Hour 30 mins<br>
<em>All meetings are <strong>‘</strong>Open’</em><br>
Postcode: BH4 9DN</p>
<p><b>Bournemouth BH1 Akron House ♿</b><br>
BH1 Project, 107 Palmerston Rd, Bournemouth.<br>
Time: 3pm, Duration: 1 Hour 15 mins<br>
<em>All meetings are ‘Closed’ (can be ‘Opened’ on request)</em><br>
Postcode:BH1 4HP</p>
<p><b>* Pokesdown St James Church *</b><br>
<strong>This meeting has unfortunately closed down.</strong></p>
<h3><strong><span>SATURDAY</span></strong></h3>
<p><b>Christchurch Joys of Recovery ♿</b><br>
St Georges Church Hall<b>, </b>2a Jumpers Road, Christchurch<b><br>
</b>Time: 5pm,&nbsp; Duration 1 Hour 15 mins<br>
<i>All meetings are ‘Open’.</i><br>
Postcode: BH23 2JR</p>
<p><b>Bournemouth Back to Basics ♿ <strong>✉</strong></b><br>
The Night Shelter, St Paul’s Lane, Bournemouth<br>
Time: 10.30, Duration: 1 Hour 10 mins<br>
<i>All meetings are ‘Open’.</i><br>
Postcode: BH8 8AJ</p>
<p>Explanation of ‘Open’ and ‘Closed’ Meetings. If a non-alcoholic wishes to attend they can ask.</p>
`;

function parsed() {
  return parseAagbIntergroupHtml(html).flatMap((item) =>
    parseFeedMeetings(item, "bournemouth-aa", "aa", "aagb"),
  );
}

test("Bournemouth intergroup prose keeps the meeting and skips a closed-down listing", () => {
  const meetings = parsed();
  assert.equal(meetings.length, 10);
  assert.equal(
    meetings.some((meeting) => /pokesdown/i.test(meeting.name) && meeting.day === 5),
    false,
  );
  assert.equal(
    meetings.some((meeting) => /explanation/i.test(meeting.name)),
    false,
  );

  const swithun = meetings.find((meeting) => meeting.name.startsWith("Bournemouth St Swithun"));
  assert.ok(swithun);
  assert.equal(swithun.day, 0);
  assert.equal(swithun.time, "13:30");
  assert.equal(swithun.endTime, "14:45");
  assert.equal(swithun.city, "Bournemouth");
  assert.equal(swithun.postalCode, "BH1 3ED");
  assert.equal(swithun.locationName, "The Tudor Hall");
  assert.equal(swithun.attendance, "in-person");
  assert.ok(swithun.types.includes("C"));
  assert.ok(swithun.types.includes("X"));
  assert.equal(swithun.types.includes("O"), false);
  assert.match(swithun.notes ?? "", /1st Sunday/);
  assert.match(swithun.notes ?? "", /Chits available/);
  assert.match(swithun.formattedAddress ?? "", /BH1 3ED/);
  assert.doesNotMatch(swithun.formattedAddress ?? "", /\n/);

  const winton = meetings.find((meeting) => meeting.name.startsWith("Winton"));
  assert.equal(winton?.locationName, "Winton Methodist Church Hall");
  assert.equal(winton?.city, "Bournemouth");
  assert.equal(winton?.postalCode, "BH9 1DE");

  const women = meetings.find((meeting) => /Women in Recovery/.test(meeting.name));
  assert.equal(women?.time, "12:30");
  assert.equal(women?.endTime, "13:45");
  assert.equal(women?.city, "Christchurch");
  assert.equal(women?.postalCode, "BH23 1EH");
  assert.ok(women?.types.includes("O"));
  assert.ok(women?.types.includes("W"));

  const kinson = meetings.find((meeting) => /There Is A Solution/.test(meeting.name));
  assert.equal(kinson?.locationName, "St Andrew’s Church");
  assert.equal(kinson?.time, "19:30");
  assert.ok(kinson?.types.includes("C"));

  const young = meetings.find((meeting) => /Young Persons/.test(meeting.name));
  assert.equal(young?.time, "19:00");
  assert.equal(young?.endTime, "20:30");
  assert.equal(young?.postalCode, "BH1 4HS");
  assert.ok(young?.types.includes("O"));
  assert.ok(young?.types.includes("YP"));
  assert.match(young?.notes ?? "", /New address/);
  assert.match(young?.notes ?? "", /Ages 30 and younger/);

  const steps = meetings.find((meeting) => /Steps We Took/.test(meeting.name));
  assert.equal(steps?.postalCode, "BH23");
  assert.equal(steps?.city, "Christchurch");
  assert.equal(steps?.time, "12:00");
  assert.ok(steps?.types.includes("ST"));
  assert.ok(steps?.types.includes("C"));

  const westbourne = meetings.find((meeting) => /Westbourne/.test(meeting.name));
  assert.equal(westbourne?.time, "12:30");
  assert.equal(westbourne?.endTime, "14:00");
  assert.ok(westbourne?.types.includes("O"));
  assert.ok(westbourne?.types.includes("W"));
  assert.ok(westbourne?.types.includes("ST"));

  const akron = meetings.find((meeting) => /Akron/.test(meeting.name));
  assert.equal(akron?.time, "15:00");
  assert.equal(akron?.postalCode, "BH1 4HP");
  assert.ok(akron?.types.includes("C"));
  assert.equal(akron?.types.includes("O"), false);

  const joys = meetings.find((meeting) => /Joys of Recovery/.test(meeting.name));
  assert.equal(joys?.time, "17:00");
  assert.equal(joys?.endTime, "18:15");
  assert.equal(joys?.city, "Christchurch");
  assert.ok(joys?.types.includes("O"));

  const basics = meetings.find((meeting) => /Back to Basics/.test(meeting.name));
  assert.equal(basics?.time, "10:30");
  assert.equal(basics?.endTime, "11:40");
  assert.ok(basics?.types.includes("O"));
});

const printList = `
IN PERSON MEETINGS
SUNDAY Bournemouth St Swithun's ♿ ✉ The Tudor Hall, St Swithun's Church, Gervis Road, Bournemouth. BH1 3ED Time: 13.30, Duration: 1 hour 15 mins (doors open @ 1pm) 1st Sunday of each month is 'Open'. All other weeks 'Closed'.
MONDAY Christchurch Big Book Meeting Portfield Community Hall, Portfield Rd, C’church. BH23 1QT Time: 19.45, Duration: 1 Hour 15 mins.
WEDNESDAY Bournemouth Young Persons AA ♿ (*NEW VENUE*) Boscombe Baptist Church Hall, 26 Palmerston Road, Boscombe, Bournemouth. BH1 4HS Time: 7pm to 8.15. All meetings 'Open'. Ages 30 & younger. Pokesdown St James Church (Share) ♿ ✉ Christchurch Rd, Pokesdown Hill, Bournemouth. BH7 6DW. Time: 19.45. Duration: 1hr 15mins.
FRIDAY Kinson Friday ♿ ✉ St Andrew's Church, Millhams Road, Kinson. BH10 7LN. Time: 19.30. Duration: 1hr 15mins. Pokesdown St James Church ✉ This meeting ended on 12.6.2026 Boscombe Baptist Church Boscombe Baptist Church Hall, 26 Palmerston Rd. BH1 4HS. Time: 20.00. Duration: 1hr 15mins. All meetings are 'Open'.
SATURDAY Christchurch Joys of Recovery St Georges Church Hall, 2a Jumpers Road, Christchurch Time: 17.00. Duration 1hr 15mins. Postcode: BH23 2JR All meetings are 'Open'. Parking available Bournemouth Saturday Big Book Study ♿ ✉ St Albans Church Lounge, 21 Linwood Road, Bournemouth. Postcode: BH9 1DW. Time: 18.00. Duration: 1hour.
ONLINE MEETINGS SUNDAY Bournemouth One Day At A Time (Online Share Meeting) Time: 10.30. Duration: 1 hr 15 mins. All meetings 'Closed'. To join please go to: https://zoom.us/join
TRADITION 7 Sort Code: 08-92-99 Account Number: 65724729
`;

test("the Bournemouth print list keeps postcodes and drops the closed meeting", () => {
  const meetings = parseAagbPrintText(printList).flatMap((item) =>
    parseFeedMeetings(item, "bournemouth-aa", "aa", "aagb"),
  );
  const swithun = meetings.find((meeting) => meeting.name.startsWith("Bournemouth St Swithun"));
  assert.equal(swithun?.time, "13:30");
  assert.equal(swithun?.endTime, "14:45");
  assert.equal(swithun?.postalCode, "BH1 3ED");
  assert.ok(swithun?.types.includes("C"));

  const christchurch = meetings.find((meeting) => /Big Book Meeting/.test(meeting.name));
  assert.equal(christchurch?.city, "Christchurch");
  assert.equal(christchurch?.postalCode, "BH23 1QT");

  const young = meetings.find((meeting) => /Young Persons/.test(meeting.name));
  assert.equal(young?.time, "19:00");
  assert.equal(young?.endTime, "20:15");
  assert.ok(young?.types.includes("O"));
  assert.ok(young?.types.includes("YP"));

  const pokesdown = meetings.find((meeting) => /Pokesdown/.test(meeting.name));
  assert.equal(pokesdown?.name, "Pokesdown St James Church (Share)");
  assert.equal(pokesdown?.postalCode, "BH7 6DW");
  assert.equal(
    meetings.some((meeting) => /ended|closed down/i.test(meeting.name)),
    false,
  );

  const bigBook = meetings.find((meeting) => /Saturday Big Book/.test(meeting.name));
  assert.equal(bigBook?.day, 6);
  assert.equal(bigBook?.time, "18:00");
  assert.equal(bigBook?.postalCode, "BH9 1DW");

  const online = meetings.find((meeting) => /One Day At A Time/.test(meeting.name));
  assert.equal(online?.attendance, "online");
  assert.equal(online?.conferenceUrl, "https://zoom.us/join");
  assert.equal(JSON.stringify(meetings).includes("65724729"), false);
  assert.equal(JSON.stringify(meetings).includes("08-92-99"), false);
});
