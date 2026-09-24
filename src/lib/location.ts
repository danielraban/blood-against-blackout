import { slugify } from "./utils";
import { haversineKm } from "./geo";
import type { City } from "./types";

const COUNTRY_ALIASES: Record<string, string> = {
  "UNITED STATES": "US",
  USA: "US",
  "U.S.A": "US",
  "UNITED STATES OF AMERICA": "US",
  "UNITED KINGDOM": "GB",
  UK: "GB",
  GREATBRITAIN: "GB",
  BRASIL: "BR",
  BRAZIL: "BR",
  CANADA: "CA",
  AUSTRALIA: "AU",
  "NEW ZEALAND": "NZ",
  IRELAND: "IE",
};

const GENERIC_CITY_LABELS = new Set(["online", "virtual", "regional"]);

const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA",
  "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS",
  "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
  "ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA",
]);

const CITY_ALIASES: Record<string, string> = {
  "greater london": "London",
  "city of london": "London",
  nyc: "New York",
  "new york city": "New York",
  "the bronx": "Bronx",
};

const KNOWN_MUNICIPALITIES = new Set([
  "london",
  "brooklyn",
  "manhattan",
  "queens",
  "bronx",
  "staten island",
  "new york",
]);

const DIRECTIONAL_PREFIX =
  /^(north|south|east|west|downtown|central|upper|lower)\s+(.+)$/i;

export type PlaceFields = {
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export function cleanLocationPart(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim();
  return cleaned || null;
}

export function normalizeCountry(value: string | null) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase().replace(/\./g, "");
  return COUNTRY_ALIASES[upper] ?? (upper.length === 2 ? upper : cleaned);
}

export function isStateCode(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return false;
  return STATE_CODES.has(cleaned.toUpperCase());
}

export function normalizeState(value: string | null) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  if (isBmltAreaName(cleaned) || isPostalCode(cleaned)) return null;
  return isStateCode(cleaned) ? cleaned.toUpperCase() : cleaned;
}

export function isPostalCode(value: string | null | undefined) {
  return parsePostalAndStatePrefix(value) != null;
}

export function parsePostalAndStatePrefix(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  const withState = cleaned.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withState && isStateCode(withState[1])) {
    return { state: withState[1].toUpperCase(), postal: withState[2] };
  }
  if (/^\d{5}(?:-\d{4})?$/.test(cleaned)) {
    return { state: null, postal: cleaned };
  }
  if (/^[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/.test(cleaned)) {
    return { state: null, postal: cleaned.toUpperCase().replace(/\s+/, " ") };
  }
  if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(cleaned)) {
    return { state: null, postal: cleaned.toUpperCase().replace(/\s+/, " ") };
  }
  if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?$/.test(cleaned) && /\d/.test(cleaned)) {
    return { state: null, postal: cleaned.toUpperCase() };
  }
  return null;
}

export function isBmltAreaName(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return false;
  return /^\d{1,2}\s/.test(cleaned) || cleaned.includes(" / ");
}

export function cleanNeighborhood(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  const stripped = cleaned.replace(/^\d{1,2}\s+/, "").trim();
  if (!stripped || stripped.includes(" / ")) return null;
  if (isPostalCode(stripped) || isStateCode(stripped)) return null;
  return stripped;
}

export function canonicalCityName(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  return CITY_ALIASES[cleaned.toLowerCase()] ?? cleaned;
}

function isKnownMunicipality(value: string | null | undefined) {
  const canonical = canonicalCityName(value);
  if (!canonical) return false;
  return KNOWN_MUNICIPALITIES.has(canonical.toLowerCase());
}

const STREET_LABEL =
  /\b(street|road|rd|gardens|gdns|gdn|lane|ln|wharf|avenue|ave|close|drive|way|terrace|crescent|parade|place)\b/i;

const FORMATTED_PLACE_SKIP = new Set([
  "usa",
  "us",
  "uk",
  "gb",
  "united kingdom",
  "united states",
  "great britain",
]);

export function collapseAddressWhitespace(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  return cleaned || null;
}

function isStreetLabel(value: string) {
  return STREET_LABEL.test(value);
}

function formattedPartPostal(part: string) {
  const parsed = parsePostalAndStatePrefix(part);
  if (!parsed?.postal || parsed.state) return null;
  return parsed.postal;
}

export function placeFromFormattedAddress(
  formatted: string | null | undefined,
  country: string | null | undefined,
) {
  const formattedAddress = collapseAddressWhitespace(formatted);
  if (!formattedAddress) {
    return {
      formattedAddress: null,
      city: null,
      neighborhood: null,
      postalCode: null,
    };
  }
  const skip = new Set(FORMATTED_PLACE_SKIP);
  const countryName = country?.trim().toLowerCase();
  if (countryName) skip.add(countryName);
  const parts = formattedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let postalCode: string | null = null;
  const placeParts: string[] = [];
  for (const part of parts) {
    const postal = formattedPartPostal(part);
    if (postal) {
      postalCode = postalCode ?? postal;
      continue;
    }
    placeParts.push(part);
  }
  const cityIndex = placeParts.findIndex((part) => isKnownMunicipality(part));
  if (cityIndex >= 0) {
    let neighborhood: string | null = null;
    for (let index = cityIndex - 1; index >= 0; index -= 1) {
      const part = placeParts[index];
      const lower = part.toLowerCase();
      if (skip.has(lower) || isStreetLabel(part) || isPostalCode(part) || isStateCode(part)) {
        if (isStreetLabel(part)) break;
        continue;
      }
      neighborhood = isUsableNeighborhood(part) ? cleanNeighborhood(part) : null;
      break;
    }
    return {
      formattedAddress,
      city: canonicalCityName(placeParts[cityIndex]),
      neighborhood,
      postalCode,
    };
  }
  return {
    formattedAddress,
    city: null,
    neighborhood: null,
    postalCode,
  };
}

export function isPlausibleState(value: string | null | undefined) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return true;
  if (isPostalCode(cleaned) || isBmltAreaName(cleaned) || isKnownMunicipality(cleaned)) {
    return false;
  }
  if (isStateCode(cleaned)) return true;
  return cleaned.length <= 40 && !/\d/.test(cleaned);
}

export function regionHintParts(regionHint: string | null | undefined) {
  const hint = regionHint?.trim().toUpperCase();
  if (!hint || hint === "ONLINE" || hint === "EU") {
    return { country: null, state: null };
  }
  const [country, ...stateParts] = hint.split("-");
  if (!/^[A-Z]{2}$/.test(country)) {
    return { country: null, state: null };
  }
  return {
    country,
    state: stateParts.length ? stateParts.join("-") : null,
  };
}

export function applyRegionHint(
  location: { state: string | null; country: string | null },
  regionHint: string | null | undefined,
) {
  const hint = regionHintParts(regionHint);
  return {
    state: normalizeState(location.state) ?? hint.state,
    country: normalizeCountry(location.country) ?? hint.country,
  };
}

export function isUsableCityLabel(value: string | null) {
  const city = canonicalCityName(value);
  if (!city || city.length < 2 || city.length > 80) return false;
  if (GENERIC_CITY_LABELS.has(city.toLowerCase())) return false;
  if (isPostalCode(city) || isStateCode(city) || isBmltAreaName(city)) return false;
  return true;
}

export function isUsableNeighborhood(value: string | null | undefined) {
  const neighborhood = cleanNeighborhood(value);
  if (!neighborhood || neighborhood.length < 2 || neighborhood.length > 80) {
    return false;
  }
  return !GENERIC_CITY_LABELS.has(neighborhood.toLowerCase());
}

function sameName(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
}

function promoteDirectionalCity(label: string | null) {
  if (!label) return null;
  const match = label.match(DIRECTIONAL_PREFIX);
  if (!match || !isKnownMunicipality(match[2])) return null;
  return canonicalCityName(match[2]);
}

export function normalizePlaceFields(input: PlaceFields): PlaceFields {
  let city = cleanLocationPart(input.city);
  let neighborhood = cleanNeighborhood(input.neighborhood);
  let state = cleanLocationPart(input.state);
  let postalCode = cleanLocationPart(input.postalCode);
  const country = normalizeCountry(input.country);

  const fromCity = parsePostalAndStatePrefix(city);
  if (fromCity) {
    postalCode = postalCode ?? fromCity.postal;
    const leftover = state;
    if (fromCity.state) state = fromCity.state;
    if (leftover && isBmltAreaName(leftover)) {
      neighborhood = neighborhood ?? cleanNeighborhood(leftover);
      city = null;
    } else if (
      leftover &&
      isUsableCityLabel(leftover) &&
      !isStateCode(leftover)
    ) {
      city = leftover;
    } else {
      city = null;
    }
  }

  const fromState = parsePostalAndStatePrefix(state);
  if (fromState && !fromState.state) {
    postalCode = postalCode ?? fromState.postal;
    state = null;
  } else if (fromState?.state && fromState.postal) {
    postalCode = postalCode ?? fromState.postal;
    state = fromState.state;
  }

  if (state && isBmltAreaName(state)) {
    neighborhood = neighborhood ?? cleanNeighborhood(state);
    state = null;
  }
  if (city && isBmltAreaName(city)) {
    neighborhood = neighborhood ?? cleanNeighborhood(city);
    city = null;
  }

  if (
    city &&
    isStateCode(city) &&
    state &&
    !isStateCode(state) &&
    isUsableCityLabel(state)
  ) {
    const swapped = city;
    city = state;
    state = swapped.toUpperCase();
  }

  if (state && isKnownMunicipality(state) && city && !isStateCode(city) && !isKnownMunicipality(city)) {
    neighborhood = neighborhood ?? city;
    city = canonicalCityName(state);
    state = null;
  }

  const directionalCity = promoteDirectionalCity(city);
  if (directionalCity) {
    neighborhood = neighborhood ?? city;
    city = directionalCity;
  }
  if (!city) {
    city = promoteDirectionalCity(neighborhood);
  }

  city = canonicalCityName(city);

  if (sameName(city, state)) state = null;
  if (sameName(city, neighborhood)) neighborhood = null;

  state = isPlausibleState(state) ? normalizeState(state) : null;
  city = isUsableCityLabel(city) ? city : null;
  neighborhood = isUsableNeighborhood(neighborhood) ? neighborhood : null;

  return { city, neighborhood, state, postalCode, country };
}

export function locationNeedsEnrichment(place: PlaceFields) {
  if (!isUsableCityLabel(place.city)) return true;
  if (!place.country) return true;
  if ((place.country === "US" || place.country === "CA" || place.country === "AU") && !place.state) {
    return true;
  }
  if (place.state && !isPlausibleState(place.state)) return true;
  return false;
}

export function placeFingerprint(
  place: PlaceFields,
  lat?: number | null,
  lng?: number | null,
) {
  return [
    place.city ?? "",
    place.neighborhood ?? "",
    place.state ?? "",
    place.postalCode ?? "",
    place.country ?? "",
    lat != null && Number.isFinite(lat) ? lat.toFixed(3) : "",
    lng != null && Number.isFinite(lng) ? lng.toFixed(3) : "",
  ]
    .map((part) => part.toLowerCase().trim())
    .join("|");
}

export function reverseGeocodeKey(lat: number, lng: number) {
  return `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function mergeResolvedPlace(base: PlaceFields, extra: PlaceFields): PlaceFields {
  const extraNeighborhood = extra.neighborhood;
  const promoted =
    extra.city &&
    extraNeighborhood &&
    base.city &&
    slugify(extraNeighborhood) === slugify(base.city);
  return normalizePlaceFields({
    city: promoted ? extra.city : base.city && isUsableCityLabel(base.city) ? base.city : extra.city,
    neighborhood: promoted ? extraNeighborhood : base.neighborhood ?? extra.neighborhood,
    state: base.state && isPlausibleState(base.state) ? base.state : extra.state,
    postalCode: base.postalCode ?? extra.postalCode,
    country: base.country ?? extra.country,
  });
}

export function cityKey(input: {
  city: string;
  state: string | null;
  country: string | null;
  geohash4?: string | null;
  neighborhood?: string | null;
}) {
  const neighborhood = input.neighborhood ? `${slugify(input.neighborhood)}-` : "";
  const city = slugify(input.city) || "city";
  const state = slugify(input.state ?? "") || "xx";
  const country = slugify(input.country ?? "") || "xx";
  const geoScope = input.country ? "" : `-${input.geohash4?.slice(0, 3) || "geo"}`;
  return `${neighborhood}${city}-${state}-${country}${geoScope}`;
}

export function formatCitySuggestion(city: City) {
  const parts = [city.label];
  if (city.parentLabel && slugify(city.parentLabel) !== slugify(city.label)) {
    parts.push(city.parentLabel);
  }
  if (city.state) parts.push(city.state);
  if (city.country) parts.push(city.country);
  return parts.join(", ");
}

export function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

export function collapseCitySuggestions(rows: City[]) {
  const collapsed: City[] = [];
  for (const city of rows) {
    if (!isUsableCityLabel(city.label) && !city.parentLabel) continue;
    const duplicate = collapsed.some((candidate) => {
      const samePlace =
        slugify(candidate.label) === slugify(city.label) &&
        (candidate.parentLabel ?? "") === (city.parentLabel ?? "") &&
        normalizeCountry(candidate.country) === normalizeCountry(city.country) &&
        haversineKm(candidate.lat, candidate.lng, city.lat, city.lng) < 40;
      const swapped =
        slugify(candidate.label) === slugify(city.state ?? "") &&
        slugify(city.label) === slugify(candidate.state ?? "") &&
        normalizeCountry(candidate.country) === normalizeCountry(city.country) &&
        haversineKm(candidate.lat, candidate.lng, city.lat, city.lng) < 40;
      return samePlace || swapped;
    });
    if (!duplicate) collapsed.push(city);
  }
  return collapsed;
}
