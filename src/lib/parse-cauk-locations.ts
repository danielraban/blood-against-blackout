import { slugify } from "./utils";
import type { RawMeeting } from "./parse-feed";
import { ukCityAndPostcode } from "./uk-place";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const PLACES = [
  "bournemouth",
  "poole",
  "boscombe",
  "ferndown",
  "christchurch",
  "weymouth",
  "dorchester",
  "portland",
  "salisbury",
  "southampton",
  "eastleigh",
  "totton",
  "yeovil",
  "margate",
];

const UK_CENTROID = { lat: 55.378, lng: -3.436 };

export function parseCaukLocationsHtml(html: string): RawMeeting[] {
  const meetings: RawMeeting[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      textOf(cell[1] ?? ""),
    );
    if (cells.length < 10) continue;
    const meeting = parseRow(cells);
    if (meeting) meetings.push(meeting);
  }
  return meetings;
}

function parseRow(cells: string[]): RawMeeting | null {
  const [dayLabel, timeLabel, name, location, formatted, , , types, latText, lngText] = cells;
  if (!name || !dayLabel || !timeLabel) return null;
  const day = WEEKDAYS.indexOf(dayLabel.toLowerCase());
  const time = clock(timeLabel);
  if (day < 0 || !time) return null;
  const typeList = (types ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
  if (isOnline(location ?? "", formatted ?? "", typeList)) return null;
  const place = ukCityAndPostcode(formatted ?? "");
  if (!isWantedPlace(formatted ?? "", place.city)) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  const pinned =
    Number.isFinite(lat) && Number.isFinite(lng) && !isUkCentroid(lat, lng)
      ? { latitude: lat, longitude: lng }
      : {};
  return {
    name,
    slug: slugify(`${name} ${WEEKDAYS[day]} ${time}`),
    day,
    time,
    types: typeList.map(typeCode),
    location: location || null,
    address: formatted || null,
    city: place.city,
    postal_code: place.postalCode,
    country: "UK",
    timezone: "Europe/London",
    formatted_address: formatted || null,
    ...pinned,
    entity: "Cocaine Anonymous UK",
    entity_url: "https://meetings.cocaineanonymous.org.uk/meetings/",
  };
}

function isWantedPlace(formatted: string, city: string | null) {
  if (city && PLACES.includes(city.toLowerCase())) return true;
  return formatted
    .split(",")
    .map((part) => part.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, "").trim().toLowerCase())
    .some((part) => PLACES.includes(part));
}

function isOnline(location: string, formatted: string, types: string[]) {
  if (types.some((type) => /online/i.test(type))) return true;
  return /^(online|zoom)$/i.test(location.trim()) || /^online$/i.test(formatted.trim());
}

function isUkCentroid(lat: number, lng: number) {
  return Math.abs(lat - UK_CENTROID.lat) < 0.01 && Math.abs(lng - UK_CENTROID.lng) < 0.01;
}

function clock(value: string) {
  if (/^noon$/i.test(value.trim())) return "12:00";
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function typeCode(type: string) {
  const lower = type.toLowerCase();
  if (lower === "open") return "O";
  if (lower === "closed") return "C";
  if (lower.includes("wheelchair")) return "X";
  if (lower === "women") return "W";
  if (lower.includes("big book")) return "B";
  if (lower.includes("step")) return "ST";
  return type;
}

function textOf(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
