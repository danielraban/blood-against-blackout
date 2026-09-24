export type GeocodeCandidate = {
  lat: number | null;
  lng: number | null;
  attendance: string;
  formattedAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  geohash4: string | null;
};

export function cityGeocodeQuery(item: {
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  return [item.city, item.state, item.country].filter(Boolean).join(", ");
}

export function geocodeQueriesForMeeting(item: GeocodeCandidate) {
  const queries: string[] = [];
  const missingCoordinates = item.lat == null || item.lng == null;
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
