import { normalizeCountry, normalizeState } from "./location";

const GENERIC_UTC = /^(UTC|GMT|Z|Etc\/UTC|Etc\/GMT|Etc\/GMT0|GMT\+0|GMT-0)$/i;

const US_STATE_ZONES: Record<string, string> = {
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  IN: "America/Indiana/Indianapolis",
  KY: "America/New_York",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  NC: "America/New_York",
  NH: "America/New_York",
  NJ: "America/New_York",
  NY: "America/New_York",
  OH: "America/New_York",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  VA: "America/New_York",
  VT: "America/New_York",
  WV: "America/New_York",
  AL: "America/Chicago",
  AR: "America/Chicago",
  IA: "America/Chicago",
  IL: "America/Chicago",
  KS: "America/Chicago",
  LA: "America/Chicago",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  ND: "America/Chicago",
  NE: "America/Chicago",
  OK: "America/Chicago",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  WI: "America/Chicago",
  AZ: "America/Phoenix",
  CO: "America/Denver",
  MT: "America/Denver",
  NM: "America/Denver",
  UT: "America/Denver",
  WY: "America/Denver",
  ID: "America/Boise",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
};

const validZones = new Map<string, boolean>();

export function isValidTimeZone(value: string) {
  const cached = validZones.get(value);
  if (cached != null) return cached;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    validZones.set(value, true);
    return true;
  } catch {
    validZones.set(value, false);
    return false;
  }
}

export function isGenericUtc(value: string | null | undefined) {
  return Boolean(value && GENERIC_UTC.test(value.trim()));
}

export function timezoneFromCoords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat >= 18.5 && lat <= 22.5 && lng >= -161 && lng <= -154) {
    return "Pacific/Honolulu";
  }
  if (lat >= 51 && lat <= 72 && lng >= -172 && lng <= -129) {
    return "America/Anchorage";
  }
  if (lat >= 24 && lat <= 72 && lng >= -135 && lng <= -52) {
    if (lng >= -85) return "America/New_York";
    if (lng >= -101) return "America/Chicago";
    if (lat <= 37.5 && lng >= -115 && lng <= -109) return "America/Phoenix";
    if (lng >= -115) return "America/Denver";
    return "America/Los_Angeles";
  }
  if (lat >= 49 && lat <= 61 && lng >= -11 && lng <= 2) return "Europe/London";
  if (lat >= 51 && lat <= 56 && lng >= 2 && lng <= 8) return "Europe/Berlin";
  return null;
}

export function timezoneFromRegion(
  country: string | null,
  state: string | null,
) {
  const countryCode = normalizeCountry(country);
  const region = normalizeState(state);
  if (countryCode === "GB" || countryCode === "IE") return "Europe/London";
  if (countryCode === "US" && region && US_STATE_ZONES[region]) {
    return US_STATE_ZONES[region];
  }
  if (countryCode === "US") return "America/New_York";
  if (countryCode === "CA" && region === "ON") return "America/Toronto";
  if (countryCode === "AU") return "Australia/Sydney";
  if (countryCode === "NZ") return "Pacific/Auckland";
  return null;
}

export function resolveMeetingTimeZone(
  meeting: {
    timezone?: string | null;
    lat?: number | null;
    lng?: number | null;
    country?: string | null;
    state?: string | null;
  },
  origin?: { lat: number; lng: number } | null,
) {
  const named = meeting.timezone?.trim() || null;
  const usableNamed =
    named && isValidTimeZone(named) && !isGenericUtc(named) ? named : null;
  if (usableNamed) return usableNamed;
  return (
    timezoneFromCoords(meeting.lat ?? null, meeting.lng ?? null) ||
    timezoneFromRegion(meeting.country ?? null, meeting.state ?? null) ||
    (origin ? timezoneFromCoords(origin.lat, origin.lng) : null) ||
    (named && isValidTimeZone(named) ? named : null)
  );
}
