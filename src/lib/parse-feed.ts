import { encodeGeohash4 } from "./geo";
import { slugify } from "./utils";
import type { Attendance } from "./types";
import type { Fellowship } from "./fellowship";
import {
  cleanLocationPart,
  isBmltAreaName,
  isPostalCode,
  isStateCode,
  isUsableCityLabel,
  normalizeCountry,
  normalizePlaceFields,
} from "./location";

export type RawMeeting = Record<string, unknown>;

export type ParsedMeeting = {
  feedId: string;
  slug: string;
  name: string;
  groupName: string | null;
  day: number | null;
  time: string | null;
  endTime: string | null;
  timezone: string | null;
  types: string[];
  attendance: Attendance;
  fellowship: Fellowship;
  locationName: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  geohash4: string | null;
  conferenceUrl: string | null;
  conferencePhone: string | null;
  notes: string | null;
  locationNotes: string | null;
  updatedAt: Date | null;
  entityName: string | null;
  entityPhone: string | null;
  entityEmail: string | null;
  entityUrl: string | null;
  entityLocation: string | null;
  feedbackEmails: string[];
};

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((v): v is string => Boolean(v));
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map(asString)
      .filter((v): v is string => Boolean(v));
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export function asDay(value: unknown): number | null {
  if (Array.isArray(value)) return asDay(value[0]);
  const n = asNumber(value);
  if (n == null) return null;
  const day = Math.round(n);
  if (day < 0 || day > 6) return null;
  return day;
}

export function asTime(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseUpdated(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cityFromFormatted(formatted: string | null, country: string | null) {
  if (!formatted) return null;
  const parts = formatted.split(",").map((p) => p.trim()).filter(Boolean);
  const skip = new Set(
    ["usa", "us", "uk", "united kingdom", "united states", country?.toLowerCase() ?? ""],
  );
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (skip.has(lower) || /^\d/.test(part) || part.length > 40) continue;
    if (isPostalCode(part) || isStateCode(part) || isBmltAreaName(part)) continue;
    if (/^[A-Z]{1,2}\d/.test(part)) continue;
    if (lower === "london" || lower.includes("london")) return "London";
    if (parts.indexOf(part) >= 1) {
      const candidate = cleanLocationPart(part.replace(/\s+[A-Z]{2}(?:\s+\d.*)?$/, ""));
      if (isUsableCityLabel(candidate)) return candidate;
    }
  }
  const fallback = cleanLocationPart(parts[1] ?? null);
  return isUsableCityLabel(fallback) ? fallback : null;
}

function hasPhysicalVenue(raw: RawMeeting) {
  const lat =
    asNumber(raw.latitude) ??
    asNumber(raw.lat) ??
    (typeof raw.coordinates === "string"
      ? Number(raw.coordinates.split(",")[0])
      : null);
  const lng =
    asNumber(raw.longitude) ??
    asNumber(raw.lng) ??
    (typeof raw.coordinates === "string"
      ? Number(raw.coordinates.split(",")[1])
      : null);
  if (withGeo(lat, lng).lat != null) return true;
  const location = asString(raw.location);
  if (!location) return false;
  const address = asString(raw.address) || asString(raw.formatted_address);
  if (!address) return false;
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2;
}

function attendanceOf(raw: RawMeeting, types: string[]): Attendance {
  const option = asString(raw.attendance_option)?.toLowerCase();
  if (option === "online") return "online";
  if (option === "hybrid") return "hybrid";
  if (option === "in_person" || option === "in-person") return "in-person";
  const conference =
    asString(raw.conference_url) || asString(raw.conference_phone);
  const hasVenue = hasPhysicalVenue(raw);
  if (conference && !hasVenue) return "online";
  if (conference && hasVenue) return "hybrid";
  if (types.includes("ONL") && !hasVenue) return "online";
  return "in-person";
}

function withGeo(
  lat: number | null,
  lng: number | null,
): { lat: number | null; lng: number | null; geohash4: string | null } {
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { lat: null, lng: null, geohash4: null };
  }
  return { lat, lng, geohash4: encodeGeohash4(lat, lng) };
}

export function looksLikeBmlt(raw: RawMeeting) {
  return (
    asString(raw.meeting_name) != null ||
    asNumber(raw.weekday_tinyint) != null ||
    asNumber(raw.id_bigint) != null
  );
}

export function asMeetingArray(data: unknown): RawMeeting[] {
  if (Array.isArray(data)) return data as RawMeeting[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as RawMeeting[];
    if (Array.isArray(obj.meetings)) return obj.meetings as RawMeeting[];
  }
  throw new Error("Feed is not a JSON array");
}

function addDuration(start: string | null, duration: string | null) {
  if (!start || !duration) return null;
  const startMatch = start.match(/^(\d{1,2}):(\d{2})/);
  const durMatch = duration.match(/^(\d{1,2}):(\d{2})/);
  if (!startMatch || !durMatch) return null;
  const total =
    Number(startMatch[1]) * 60 +
    Number(startMatch[2]) +
    Number(durMatch[1]) * 60 +
    Number(durMatch[2]);
  const mins = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTsmlMeeting(
  raw: RawMeeting,
  feedId: string,
  fellowship: Fellowship,
): ParsedMeeting | null {
  const name = asString(raw.name);
  const slug =
    asString(raw.slug) ||
    asString(raw.id) ||
    asString(raw.ID) ||
    (name ? slugify(name) : null);
  if (!name || !slug) return null;

  const types = asStringArray(raw.types).map((t) => t.toUpperCase());
  const attendance = attendanceOf(raw, types);
  if (attendance !== "in-person" && !types.includes("ONL")) types.push("ONL");
  const lat =
    asNumber(raw.latitude) ??
    asNumber(raw.lat) ??
    (typeof raw.coordinates === "string" ? Number(raw.coordinates.split(",")[0]) : null);
  const lng =
    asNumber(raw.longitude) ??
    asNumber(raw.lng) ??
    (typeof raw.coordinates === "string" ? Number(raw.coordinates.split(",")[1]) : null);
  const formattedAddress =
    asString(raw.formatted_address) ||
    [asString(raw.address), asString(raw.city), asString(raw.state), asString(raw.postal_code)]
      .filter(Boolean)
      .join(", ") ||
    null;
  const country = normalizeCountry(asString(raw.country));
  const explicitCity = cleanLocationPart(asString(raw.city));
  const inferredCity = cityFromFormatted(formattedAddress, country);
  const place = normalizePlaceFields({
    city: isUsableCityLabel(explicitCity) ? explicitCity : inferredCity,
    neighborhood: null,
    state: asString(raw.state) || asString(raw.region),
    postalCode: asString(raw.postal_code),
    country,
  });

  return {
    feedId,
    slug: slug.slice(0, 64),
    name: name.slice(0, 255),
    groupName: asString(raw.group) || asString(raw.group_name),
    day: asDay(raw.day),
    time: asTime(raw.time),
    endTime: asTime(raw.end_time),
    timezone: asString(raw.timezone),
    types,
    attendance,
    fellowship,
    locationName: asString(raw.location),
    address: asString(raw.address),
    city: place.city,
    neighborhood: place.neighborhood,
    state: place.state,
    postalCode: place.postalCode,
    country: place.country,
    formattedAddress,
    ...withGeo(lat, lng),
    conferenceUrl: asString(raw.conference_url),
    conferencePhone: asString(raw.conference_phone),
    notes: asString(raw.notes),
    locationNotes: asString(raw.location_notes) || asString(raw.conference_url_notes),
    updatedAt: parseUpdated(raw.updated),
    entityName: asString(raw.entity),
    entityPhone: asString(raw.entity_phone),
    entityEmail: asString(raw.entity_email),
    entityUrl: asString(raw.entity_url),
    entityLocation: asString(raw.entity_location),
    feedbackEmails: asStringArray(raw.feedback_emails),
  };
}

export function parseBmltMeeting(
  raw: RawMeeting,
  feedId: string,
  fellowship: Fellowship,
): ParsedMeeting | null {
  const name = asString(raw.meeting_name);
  const id = asString(raw.id_bigint) || asString(raw.id);
  if (!name || !id) return null;

  const weekday = asNumber(raw.weekday_tinyint);
  const day = weekday == null ? null : Math.round(weekday) - 1;
  const formats = asStringArray(raw.formats).map((t) => t.toUpperCase());
  const venue = asNumber(raw.venue_type);
  const conferenceUrl = asString(raw.virtual_meeting_link);
  const conferencePhone = asString(raw.phone_meeting_number);
  let attendance: Attendance = "in-person";
  if (venue === 2 || (formats.includes("VM") && !formats.includes("HY"))) attendance = "online";
  else if (venue === 3 || formats.includes("HY") || (conferenceUrl && venue !== 2))
    attendance = "hybrid";
  if (conferenceUrl && attendance === "in-person") attendance = "hybrid";

  const place = normalizePlaceFields({
    city: asString(raw.location_municipality),
    neighborhood: asString(raw.location_city_subsection),
    state: asString(raw.location_province) || asString(raw.location_sub_province),
    postalCode: asString(raw.location_postal_code_1),
    country: asString(raw.location_nation),
  });
  const address = asString(raw.location_street);
  const formattedAddress =
    [address, place.neighborhood, place.city, place.state, place.postalCode, place.country]
      .filter(Boolean)
      .join(", ") || null;
  const notes = [asString(raw.comments), asString(raw.virtual_meeting_additional_info)]
    .filter(Boolean)
    .join("\n") || null;
  const start = asTime(raw.start_time);
  const lat = asNumber(raw.latitude);
  const lng = asNumber(raw.longitude);

  return {
    feedId,
    slug: slugify(`${id}-${name}`).slice(0, 64),
    name: name.slice(0, 255),
    groupName: name,
    day: day != null && day >= 0 && day <= 6 ? day : null,
    time: start,
    endTime: addDuration(start, asString(raw.duration_time)),
    timezone: asString(raw.time_zone),
    types: formats,
    attendance,
    fellowship,
    locationName: asString(raw.location_text),
    address,
    city: place.city,
    neighborhood: place.neighborhood,
    state: place.state,
    postalCode: place.postalCode,
    country: place.country,
    formattedAddress,
    ...withGeo(lat, lng),
    conferenceUrl,
    conferencePhone,
    notes,
    locationNotes: asString(raw.location_info),
    updatedAt: null,
    entityName: asString(raw.root_server_uri),
    entityPhone: null,
    entityEmail: null,
    entityUrl: asString(raw.root_server_uri),
    entityLocation: place.city,
    feedbackEmails: [],
  };
}

export function parseFeedMeetings(
  raw: RawMeeting,
  feedId: string,
  fellowship: Fellowship,
  format: "tsml" | "bmlt",
): ParsedMeeting[] {
  const useBmlt = format === "bmlt" || looksLikeBmlt(raw);
  if (useBmlt) {
    const parsed = parseBmltMeeting(raw, feedId, fellowship);
    return parsed ? [parsed] : [];
  }

  const dayValues = Array.isArray(raw.day) ? raw.day : [raw.day];
  const days = [
    ...new Set(
      dayValues
        .map((value) => asDay(value))
        .filter((value): value is number => value != null),
    ),
  ];
  const targets = days.length ? days : [null];
  const rows: ParsedMeeting[] = [];
  for (const day of targets) {
    const parsed = parseTsmlMeeting({ ...raw, day }, feedId, fellowship);
    if (!parsed) continue;
    if (targets.length > 1 && day != null) {
      parsed.slug = uniqueDaySlug(parsed.slug, day);
    }
    rows.push(parsed);
  }
  return rows;
}

export function uniqueDaySlug(base: string, day: number) {
  return `${base.slice(0, 60)}-${day}`;
}

export function dedupeMeetingsBySlug<T extends { feedId: string; slug: string }>(
  rows: T[],
) {
  const chosen = new Map<string, T>();
  for (const row of rows) {
    chosen.set(`${row.feedId}:${row.slug}`, row);
  }
  return [...chosen.values()];
}

export function bmltSearchUrl(root: string) {
  const base = root.endsWith("/") ? root : `${root}/`;
  return `${base}client_interface/json/?switcher=GetSearchResults`;
}

export function bmltInfoUrl(root: string) {
  const base = root.endsWith("/") ? root : `${root}/`;
  return `${base}client_interface/json/?switcher=GetServerInfo`;
}
