import { slugify } from "./utils";
import type { RawMeeting } from "./parse-feed";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ENTITY_NAME = "Bournemouth & District Intergroup";
const ENTITY_URL =
  "https://www.alcoholics-anonymous.org.uk/intergroups/bournemouth-district-intergroup/";
const DISTRICT_CITY = "Bournemouth";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: "-",
  mdash: "-",
  hellip: "...",
};

export function parseAagbIntergroupHtml(html: string): RawMeeting[] {
  const meetings: RawMeeting[] = [];
  const sections = weekdaySections(html);
  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      const meeting = parseParagraph(paragraph, section.day);
      if (meeting) meetings.push(meeting);
    }
  }
  return meetings;
}

function weekdaySections(html: string) {
  const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const sections: { day: number; paragraphs: string[] }[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading || heading.index == null) continue;
    const label = textOf(heading[1] ?? "").toLowerCase();
    const day = WEEKDAYS.indexOf(label);
    if (day < 0) continue;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const slice = html.slice(start, end);
    sections.push({
      day,
      paragraphs: [...slice.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(
        (match) => match[1] ?? "",
      ),
    });
  }
  return sections;
}

function parseParagraph(html: string, day: number): RawMeeting | null {
  if (/closed down/i.test(textOf(html))) return null;
  const lines = linesFromHtml(html);
  const timeLineIndex = lines.findIndex((line) => /time\s*:/i.test(line));
  if (timeLineIndex < 0) return null;

  const nameSource = lines.slice(0, timeLineIndex).find((line) => cleanName(line));
  const nameBits = pullParens(cleanName(nameSource ?? ""));
  const name = nameBits.text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!name) return null;

  const body = lines.slice(timeLineIndex === 0 ? 1 : Math.min(timeLineIndex, 1)).join(" ");
  const timeAt = body.search(/time\s*:/i);
  const addressSource = timeAt >= 0 ? body.slice(0, timeAt) : body;
  const afterTime = timeAt >= 0 ? body.slice(timeAt) : "";
  const addressBits = pullParens(addressSource);
  const address = tidy(addressBits.text.replace(/\s+,/g, ",").replace(/,\s*$/g, ""));
  const clock = readClock(afterTime);
  if (!clock) return null;
  const postcode = readPostcode(afterTime);
  const city = cityFromAddress(address) ?? DISTRICT_CITY;
  const location = locationFromAddress(address, name);
  const openClosed = readOpenClosed(textOf(html));
  const types = meetingTypes(name, html, openClosed);
  const notes = meetingNotes(html, afterTime, nameBits.notes);
  const locationNotes = addressBits.notes;

  return {
    name,
    slug: slugify(`${name} ${WEEKDAYS[day]} ${clock}`),
    day,
    time: clock,
    end_time: addMinutes(clock, readDurationMinutes(afterTime)),
    types,
    location,
    address,
    city,
    postal_code: postcode,
    country: "UK",
    timezone: "Europe/London",
    formatted_address: [address, postcode, "United Kingdom"].filter(Boolean).join(", "),
    notes: notes.length ? notes.join(". ") : null,
    location_notes: locationNotes.length ? locationNotes.join(". ") : null,
    entity: ENTITY_NAME,
    entity_url: ENTITY_URL,
  };
}

function meetingTypes(name: string, html: string, openClosed: "O" | "C") {
  const types: string[] = [openClosed];
  if (html.includes("♿")) types.push("X");
  if (/\bwomen\b/i.test(name)) types.push("W");
  else if (/\bmen\b/i.test(name)) types.push("M");
  if (/young persons?\b/i.test(name)) types.push("YP");
  if (/\bbeginners?\b/i.test(name)) types.push("BE");
  if (/big book/i.test(name)) types.push("B");
  if (/\bsteps?\b/i.test(name)) types.push("ST");
  return types;
}

function meetingNotes(html: string, afterTime: string, extra: string[]) {
  const prose = tidy(
    afterTime
      .replace(/time\s*:\s*[^,]*,?/i, "")
      .replace(/duration:?\s*(?:\d+\s*hours?)?(?:\s*\d+\s*mins?)?\.?/i, "")
      .replace(/postcode:\s*[a-z0-9 ]+\.?/i, ""),
  );
  const pulled = pullParens(prose);
  const notes = [...extra, ...pulled.notes, pulled.text]
    .map((note) => tidy(note).replace(/^[.,\s]+|[.,\s]+$/g, ""))
    .filter((note) => note.length > 1);
  if (html.includes("✉") && !notes.some((note) => /chit/i.test(note))) {
    notes.push("Chits available");
  }
  if (/!\*NEW ADDRESS!\*/i.test(html) && !notes.some((note) => /new address/i.test(note))) {
    notes.unshift("New address");
  }
  return [...new Set(notes)];
}

function readOpenClosed(text: string): "O" | "C" {
  const normalized = text.replace(/[‘’]/g, "'").replace(/\s+/g, " ");
  const allOpen = /all meetings(?:\s+are)?\s+'?\s*open\b/i.test(normalized);
  const otherWeeksClosed = /other weeks are\s+'?\s*closed\b/i.test(normalized);
  if (allOpen && !otherWeeksClosed) return "O";
  return "C";
}

function readClock(value: string) {
  const match = value.match(/time\s*:\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function readDurationMinutes(value: string) {
  const match = value.match(
    /duration:?\s*(?:(\d+)\s*(?:hours?|hrs?))?(?:\s*(\d+)\s*mins?)?/i,
  );
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function readPostcode(value: string) {
  const match = value.match(/postcode:\s*([a-z]{1,2}\d[a-z\d]?(?:\s*\d[a-z]{2})?)/i);
  if (!match) return null;
  const compact = match[1].toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) && compact.length >= 5) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact)) return compact;
  return null;
}

function cityFromAddress(address: string) {
  const parts = address
    .split(",")
    .map((part) => tidy(part).replace(/[.\s]+$/g, ""))
    .filter(Boolean);
  if (!parts.length) return null;
  let last = parts[parts.length - 1] ?? "";
  const dotted = last.match(/^(.*?)\.\s+([A-Za-z].*)$/);
  if (dotted?.[2]) last = tidy(dotted[2]).replace(/[.\s]+$/g, "");
  if (!last || isStreetish(last)) return null;
  return last;
}

function locationFromAddress(address: string, name: string) {
  const first = tidy(address.split(",")[0] ?? "").replace(/[.\s]+$/g, "");
  if (!first || /^\d/.test(first)) return name;
  return first;
}

function isStreetish(value: string) {
  return (
    /^\d/.test(value) ||
    /\b(road|rd|street|lane|ln|avenue|ave|close|drive|way|hill|gardens|gdns)\b/i.test(value)
  );
}

function linesFromHtml(html: string) {
  return htmlToText(html)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function htmlToText(html: string) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, "\n")).replace(/<[^>]+>/g, "");
}

function textOf(html: string) {
  return tidy(htmlToText(html).replace(/\s+/g, " "));
}

function cleanName(value: string) {
  return tidy(
    value
      .replace(/♿/g, " ")
      .replace(/✉/g, " ")
      .replace(/!\*NEW ADDRESS!\*/gi, " "),
  );
}

function pullParens(value: string) {
  const notes: string[] = [];
  const text = value.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const note = tidy(inner);
    if (note) notes.push(note);
    return " ";
  });
  return { text: tidy(text), notes };
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\u00a0/g, " ");
}

function tidy(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const PRINT_STOP =
  /tradition\s*7|sort code\s*:|account number|in person aa meetings:|aa definitions/i;

export function parseAagbPrintText(text: string): RawMeeting[] {
  const cleaned = text
    .replace(/C['’]church/gi, "Christchurch")
    .split(PRINT_STOP)[0]
    .replace(/\s+/g, " ")
    .trim();
  const meetings: RawMeeting[] = [];
  for (const section of printDaySections(cleaned)) {
    for (const chunk of printMeetingChunks(section.body)) {
      const meeting = parsePrintChunk(chunk, section.day);
      if (meeting) meetings.push(meeting);
    }
  }
  return meetings;
}

function printDaySections(text: string) {
  const marks = [
    ...text.matchAll(/\b(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b/g),
  ];
  const sections: { day: number; body: string }[] = [];
  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    if (!mark || mark.index == null) continue;
    const day = WEEKDAYS.indexOf((mark[1] ?? "").toLowerCase());
    const start = mark.index + mark[0].length;
    const end = marks[index + 1]?.index ?? text.length;
    sections.push({ day, body: text.slice(start, end).trim() });
  }
  return sections;
}

function printMeetingChunks(body: string) {
  const times = [...body.matchAll(/Time:\s*\d/gi)];
  const chunks: string[] = [];
  let cursor = 0;
  for (let index = 0; index < times.length; index += 1) {
    const timeAt = times[index]?.index ?? 0;
    const nextTime = times[index + 1]?.index ?? body.length;
    const split = splitPrintNotes(body.slice(timeAt, nextTime));
    const lead = stripClosedLead(body.slice(cursor, timeAt));
    if (lead) chunks.push(tidy(`${lead} ${split.notes}`));
    const restAt = split.rest ? body.lastIndexOf(split.rest, nextTime) : -1;
    cursor = restAt >= 0 ? restAt : nextTime;
  }
  return chunks;
}

function splitPrintNotes(after: string) {
  const head =
    after.match(
      /^Time:\s*.*?Duration:?\s*(?:\d+\s*(?:hours?|hrs?))?(?:\s*\d+\s*mins?)?\.?/i,
    )?.[0] ??
    after.match(/^Time:\s*.*?to\s+\d{1,2}[.:]\d{2}\s*(?:am|pm)?/i)?.[0] ??
    "";
  const rest = after.slice(head.length).replace(/^[\s.]+/, "").trim();
  const sentences = rest.split(/(?<=\.)\s+(?=[A-Z(])/);
  const notes: string[] = [head];
  let index = 0;
  for (; index < sentences.length; index += 1) {
    const consumed = consumePrintSentence(sentences[index] ?? "");
    if (consumed.note) notes.push(consumed.note);
    if (!consumed.rest) continue;
    if (isPrintNote(consumed.rest) || /^postcode:/i.test(consumed.rest) || /^\(/.test(consumed.rest)) {
      sentences.splice(index + 1, 0, consumed.rest);
      continue;
    }
    return {
      notes: tidy(notes.join(" ")),
      rest: tidy([consumed.rest, ...sentences.slice(index + 1)].join(" ")),
    };
  }
  return { notes: tidy(notes.join(" ")), rest: "" };
}

function consumePrintSentence(sentence: string) {
  const postcode = sentence.match(
    /^postcode:\s*(?:[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}|[a-z]{1,2}\d[a-z\d]?)\.?\s+(\S.*)$/i,
  );
  if (postcode?.[1] && /^[A-Z]/.test(postcode[1])) {
    return {
      note: sentence.slice(0, sentence.length - postcode[1].length).trim(),
      rest: postcode[1].trim(),
    };
  }
  const paren = sentence.match(/^(\([^)]*\))\s+(\S.*)$/);
  if (paren?.[2] && /^[A-Z]/.test(paren[2]) && isPrintNote(paren[1] ?? "")) {
    return { note: tidy(paren[1] ?? ""), rest: tidy(paren[2]) };
  }
  const shortNote = sentence.match(
    /^(parking available|some parking(?:\s*&\s*disabled parking)?|ages \d+[^.]*|for directions:[^.]*)\s+(\S.*)$/i,
  );
  if (shortNote?.[2] && /^[A-Z]/.test(shortNote[2])) {
    return { note: tidy(shortNote[1] ?? ""), rest: tidy(shortNote[2]) };
  }
  if (isPrintNote(sentence)) return { note: sentence, rest: "" };
  return { note: "", rest: sentence };
}

function isPrintNote(sentence: string) {
  return /^(?:\(?\s*)?(?:all meetings|all other|other weeks|last |1st |2nd |3rd |4th |5th |no vaping|parking|regrettably|strictly|some parking|ages |for directions|this meeting|to join|please |on last|on the last|doors open|use |postcode:|passcode:|password:|meeting id|id:|duration\b|time:)/i.test(
    sentence,
  );
}

function stripClosedLead(lead: string) {
  const index = lead.search(/this meeting (?:has )?(?:unfortunately )?(?:closed down|ended on)/i);
  if (index < 0) return lead.trim();
  return lead
    .slice(index)
    .replace(
      /^this meeting (?:has )?(?:unfortunately )?(?:closed down\.?\s*|ended on \d{1,2}\.\d{1,2}\.\d{2,4}\s*)/i,
      "",
    )
    .trim();
}

function parsePrintChunk(chunk: string, sectionDay: number): RawMeeting | null {
  if (/this meeting (?:has )?(?:unfortunately )?(?:closed down|ended on)/i.test(chunk.split(/Time:/i)[0] ?? "")) {
    return null;
  }
  const timeAt = chunk.search(/Time:\s*\d/i);
  if (timeAt < 0) return null;
  const before = chunk.slice(0, timeAt);
  const after = chunk.slice(timeAt);
  const separated = separateNameAndAddress(before);
  const name = tidy(separated.name.replace(/[*!]+/g, ""));
  if (!name || /^(online meetings|in person meetings)$/i.test(name)) return null;
  const clock = readClock(after);
  if (!clock) return null;
  const endTime = readEndClock(after, clock) ?? addMinutes(clock, readDurationMinutes(after));
  const addressBits = pullParens(separated.address);
  const postcode =
    readPostcode(`${addressBits.text} ${after}`) ?? readInlinePostcode(`${addressBits.text} ${after}`);
  const address = tidy(
    addressBits.text
      .replace(/postcode:\s*[a-z0-9 ]+\.?/i, "")
      .replace(postcode ? new RegExp(postcode.replace(/\s+/g, "\\s*"), "i") : /^$/, "")
      .replace(/\s+,/g, ",")
      .replace(/[.\s]+$/g, ""),
  );
  const conferenceUrl = chunk.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/g, "") ?? null;
  const online = Boolean(conferenceUrl);
  const day = dayInName(name) ?? sectionDay;
  const city = online ? DISTRICT_CITY : (cityFromAddress(address) ?? DISTRICT_CITY);
  const notes = meetingNotes(chunk, after, []);
  return {
    name,
    slug: slugify(`${name} ${WEEKDAYS[day]} ${clock}`),
    day,
    time: clock,
    end_time: endTime,
    types: meetingTypes(name, chunk, readOpenClosed(chunk)),
    location: online ? null : locationFromAddress(address, name),
    address: online ? null : address,
    city,
    postal_code: online ? null : postcode,
    country: "UK",
    timezone: "Europe/London",
    formatted_address: online
      ? null
      : [address, postcode, "United Kingdom"].filter(Boolean).join(", "),
    conference_url: conferenceUrl,
    notes: notes.length ? notes.join(". ") : null,
    location_notes: online || !addressBits.notes.length ? null : addressBits.notes.join(". "),
    entity: ENTITY_NAME,
    entity_phone: "01202 296000",
    entity_url: ENTITY_URL,
  };
}

function separateNameAndAddress(before: string) {
  const symbol = before.search(/[♿✉]/);
  if (symbol >= 0) {
    return {
      name: tidy(before.slice(0, symbol)),
      address: tidy(before.slice(symbol).replace(/[♿✉]/g, " ")),
    };
  }
  const number = before.search(/(?:,\s*|\s)\d{1,4}\s+[A-Za-z]/);
  if (number > 0) {
    const addressStart = before[number] === "," ? number + 1 : number;
    return {
      name: tidy(before.slice(0, number).replace(/[,\s]+$/g, "")),
      address: tidy(before.slice(addressStart)),
    };
  }
  const comma = before.indexOf(",");
  if (comma > 0) {
    return { name: tidy(before.slice(0, comma)), address: tidy(before.slice(comma + 1)) };
  }
  return { name: tidy(before), address: "" };
}

function dayInName(name: string) {
  const found = WEEKDAYS.filter((day) => new RegExp(`\\b${day}\\b`, "i").test(name));
  if (found.length !== 1) return null;
  return WEEKDAYS.indexOf(found[0] ?? "");
}

function readEndClock(value: string, start: string) {
  const match = value.match(/to\s+(\d{1,2})[.:](\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  const startHour = Number(start.slice(0, 2));
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!suffix && hour < startHour) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function readInlinePostcode(value: string) {
  const full = value.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (full?.[1]) return readPostcode(`Postcode: ${full[1]}`);
  const outward = value.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b(?!\s*\d[A-Z]{2})/i);
  if (!outward?.[1]) return null;
  return readPostcode(`Postcode: ${outward[1]}`);
}

function addMinutes(start: string, minutes: number | null) {
  if (minutes == null) return null;
  const match = start.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
