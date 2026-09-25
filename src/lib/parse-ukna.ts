import { slugify } from "./utils";
import type { RawMeeting } from "./parse-feed";
import { formatUkCity, ukCityAndPostcode, ukPostcodeIn } from "./uk-place";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WHEN =
  /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?:\s+(\d{1,2}:\d{2})(?:\s*[~–—-]\s*(\d{1,2}:\d{2}))?)?$/i;

export function parseUknaHtml(html: string): RawMeeting[] {
  const lines = htmlToLines(html);
  const meetings: RawMeeting[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const when = lines[index]?.match(WHEN);
    if (!when) continue;
    const day = WEEKDAYS.indexOf((when[1] ?? "").toLowerCase());
    const inline = clockRange(when[2] ? `${when[2]}${when[3] ? `-${when[3]}` : ""}` : "");
    const next = inline?.time ? null : clockRange(lines[index + 1] ?? "");
    const time = inline?.time ?? next?.time ?? null;
    const end = inline?.end ?? next?.end ?? null;
    if (day < 0 || !time) continue;
    const name = meetingName(lines, index);
    const block = lines.slice(index + 1, index + 12);
    const postalLine = postcodeLine(block);
    if (!postalLine) continue;
    const rawCity =
      ukCityAndPostcode(postalLine).city ?? cityBeforePostcode(block, postalLine);
    const city = rawCity ? formatUkCity(rawCity) : null;
    if (!name || !city) continue;
    meetings.push({
      name,
      slug: slugify(`${name} ${WEEKDAYS[day]} ${time}`),
      day,
      time,
      end_time: end,
      types: ["C"],
      location:
        block.find(
          (line) =>
            line !== postalLine &&
            !WHEN.test(line) &&
            !/area$/i.test(line) &&
            !/^\d{1,2}:\d{2}/.test(line),
        ) ?? name,
      address: [city, postalLine].join(", "),
      city,
      postal_code: ukPostcodeIn(postalLine),
      country: "UK",
      timezone: "Europe/London",
      formatted_address: `${block.filter((line) => !/area$/i.test(line)).join(", ")}, United Kingdom`,
      entity: "UKNA",
      entity_url: "https://meetings.ukna.org/",
    });
  }
  return meetings;
}

function meetingName(lines: string[], index: number) {
  for (let cursor = index - 1; cursor >= Math.max(0, index - 12); cursor -= 1) {
    const line = lines[cursor] ?? "";
    if (line.startsWith("## ")) return line.slice(3).trim();
  }
  return null;
}

function postcodeLine(block: string[]) {
  return (
    block.find((line) => ukPostcodeIn(line) === line) ??
    block.find((line) => ukPostcodeIn(line)) ??
    null
  );
}

function cityBeforePostcode(block: string[], postalLine: string) {
  const at = block.indexOf(postalLine);
  for (let cursor = at - 1; cursor >= 0; cursor -= 1) {
    const line = block[cursor] ?? "";
    if (!line || /area$/i.test(line) || WHEN.test(line)) continue;
    const town = townOnLine(line);
    if (town) return town;
  }
  return null;
}

function townOnLine(line: string) {
  const parts = line
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] ?? "";
    if (!part || isCounty(part) || /^(gb|uk|united kingdom)$/i.test(part) || ukPostcodeIn(part) || part.length > 40) {
      continue;
    }
    if (/^\d/.test(part) || /\b(road|rd|street|lane|ln|avenue|ave|close|drive)\b/i.test(part)) {
      continue;
    }
    return part;
  }
  return null;
}

function isCounty(value: string) {
  return /^(dorset|kent|devon|somerset|cornwall|hampshire|wiltshire|surrey|sussex)$/i.test(value);
}

function clockRange(value: string) {
  const match = value.match(/(\d{1,2}:\d{2})(?:\s*[~–—-]\s*(\d{1,2}:\d{2}))?/);
  if (!match) return null;
  const time = clock(match[1] ?? "");
  if (!time) return null;
  return { time, end: match[2] ? clock(match[2]) : null };
}

function clock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function htmlToLines(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<h2\b[^>]*>/gi, "\n## ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|dt|dd|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
