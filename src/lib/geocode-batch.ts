import { encodeGeohash4 } from "./geo";
import { slugify } from "./utils";

export const POSTCODE_GEOCODE_LIMIT = 25;

export type GeocodeCandidate = {
  lat: number | null;
  lng: number | null;
  attendance: string;
  formattedAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode?: string | null;
  locationName?: string | null;
  geohash4: string | null;
};

export function cityGeocodeQuery(item: {
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  return [item.city, item.state, item.country].filter(Boolean).join(", ");
}

export function postcodeGeocodeQuery(item: {
  postalCode?: string | null;
  city: string | null;
  country: string | null;
}) {
  const postal = item.postalCode?.trim();
  if (!postal) return null;
  return [postal, item.city, item.country].filter(Boolean).join(", ");
}

export function venuePinKey(item: {
  locationName?: string | null;
  postalCode?: string | null;
}) {
  const location = slugify(item.locationName ?? "");
  const postal = (item.postalCode ?? "").replace(/\s+/g, "").toUpperCase();
  if (!location || !postal) return null;
  return `${location}|${postal}`;
}

export function borrowVenueCoordinates<T extends GeocodeCandidate>(items: readonly T[]): T[] {
  const known = new Map<string, { lat: number; lng: number; geohash4: string }>();
  for (const item of items) {
    const key = venuePinKey(item);
    if (!key || item.lat == null || item.lng == null) continue;
    if (!known.has(key)) {
      known.set(key, {
        lat: item.lat,
        lng: item.lng,
        geohash4: item.geohash4 ?? encodeGeohash4(item.lat, item.lng),
      });
    }
  }
  return items.map((item) => {
    if (item.lat != null && item.lng != null) return item;
    const key = venuePinKey(item);
    const pin = key ? known.get(key) : undefined;
    if (!pin) return item;
    return { ...item, lat: pin.lat, lng: pin.lng, geohash4: pin.geohash4 };
  });
}

export function geocodeQueriesForMeeting(item: GeocodeCandidate) {
  const queries: string[] = [];
  const missingCoordinates = item.lat == null || item.lng == null;
  const postcodeQuery = postcodeGeocodeQuery(item);
  if (missingCoordinates && item.attendance !== "online" && postcodeQuery) {
    queries.push(postcodeQuery);
    return queries;
  }
  const cityQuery = cityGeocodeQuery(item);
  if (missingCoordinates && item.attendance !== "online" && item.formattedAddress) {
    queries.push(item.formattedAddress);
  }
  if (missingCoordinates && item.attendance !== "online" && cityQuery) {
    queries.push(cityQuery);
  }
  if (item.attendance === "online" && !item.geohash4 && cityQuery) {
    queries.push(cityQuery);
  }
  return queries;
}

export function uniqueGeocodeQueries(items: readonly GeocodeCandidate[]) {
  return [...new Set(items.flatMap(geocodeQueriesForMeeting))];
}
