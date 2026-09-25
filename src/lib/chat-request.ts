export const MAX_CHAT_MESSAGES = 12;
export const MAX_CHAT_BODY_BYTES = 65_536;
export const MAX_CHAT_MEETINGS = 200;

const GEOHASH4 = /^[0-9b-hjkmnp-z]{4}$/i;
const CITY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const COORDINATE_KEYS = new Set(["lat", "lng", "latitude", "longitude"]);

export type ChatMeetingRef = {
  feedId: string;
  slug: string;
  distanceKm: number;
};

export type ChatRequest = {
  messages: unknown[];
  geohash: string | null;
  citySlug: string | null;
  meetings: ChatMeetingRef[];
};

export type ChatRequestResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; error: string; status: number };

export function isChatBodyTooLarge(byteLength: number) {
  return byteLength > MAX_CHAT_BODY_BYTES;
}

export function containsCoordinateFields(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsCoordinateFields(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (COORDINATE_KEYS.has(key)) return true;
    if (containsCoordinateFields(record[key], depth + 1)) return true;
  }
  return false;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMeetingRef(value: unknown): ChatMeetingRef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const feedId = asTrimmedString(record.feedId);
  const slug = asTrimmedString(record.slug);
  const distanceKm = record.distanceKm;
  if (!feedId || !slug) return null;
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 0) return null;
  return {
    feedId,
    slug,
    distanceKm: Math.round(distanceKm),
  };
}

export function parseChatRequest(body: unknown): ChatRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request", status: 400 };
  }
  if (containsCoordinateFields(body)) {
    return { ok: false, error: "Precise coordinates are not accepted", status: 400 };
  }

  const record = body as Record<string, unknown>;
  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Messages are required", status: 400 };
  }
  if (messages.length > MAX_CHAT_MESSAGES) {
    return { ok: false, error: "Too many messages", status: 400 };
  }

  const rawGeohash = record.geohash;
  let geohash: string | null = null;
  if (rawGeohash != null && rawGeohash !== "") {
    const value = asTrimmedString(rawGeohash).toLowerCase();
    if (!GEOHASH4.test(value)) {
      return { ok: false, error: "Invalid geohash", status: 400 };
    }
    geohash = value;
  }

  const rawCitySlug = record.citySlug;
  let citySlug: string | null = null;
  if (rawCitySlug != null && rawCitySlug !== "") {
    const value = asTrimmedString(rawCitySlug);
    if (!CITY_SLUG.test(value) || value.length > 80) {
      return { ok: false, error: "Invalid city", status: 400 };
    }
    citySlug = value;
  }

  const rawMeetings = record.meetings;
  if (rawMeetings != null && !Array.isArray(rawMeetings)) {
    return { ok: false, error: "Invalid meetings", status: 400 };
  }
  if (Array.isArray(rawMeetings) && rawMeetings.length > MAX_CHAT_MEETINGS) {
    return { ok: false, error: "Too many meetings", status: 400 };
  }

  const meetings: ChatMeetingRef[] = [];
  for (const item of rawMeetings ?? []) {
    const parsed = parseMeetingRef(item);
    if (!parsed) {
      return { ok: false, error: "Invalid meetings", status: 400 };
    }
    meetings.push(parsed);
  }

  return {
    ok: true,
    value: { messages, geohash, citySlug, meetings },
  };
}
