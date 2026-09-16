import { slugify } from "./utils";

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

export function cleanLocationPart(value: string | null) {
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

export function normalizeState(value: string | null) {
  const cleaned = cleanLocationPart(value);
  if (!cleaned) return null;
  return /^[a-z]{2,3}$/i.test(cleaned) ? cleaned.toUpperCase() : cleaned;
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
  const city = cleanLocationPart(value);
  if (!city || city.length < 2 || city.length > 80) return false;
  return !GENERIC_CITY_LABELS.has(city.toLowerCase());
}

export function cityKey(input: {
  city: string;
  state: string | null;
  country: string | null;
  geohash4?: string | null;
}) {
  const city = slugify(input.city) || "city";
  const state = slugify(input.state ?? "") || "xx";
  const country = slugify(input.country ?? "") || "xx";
  const geoScope = input.country ? "" : `-${input.geohash4?.slice(0, 3) || "geo"}`;
  return `${city}-${state}-${country}${geoScope}`;
}
