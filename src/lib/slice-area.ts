import { normalizeCountry, normalizeState } from "./location";
import type { Meeting } from "./types";
import { slugify } from "./utils";

export type SliceCity = {
  label: string;
  parentLabel: string | null;
  state: string | null;
  country: string | null;
};

export type SliceArea = {
  labels: Set<string>;
  countries: Set<string>;
  states: Set<string>;
  neighbors: Set<string>;
};

export function sliceAreaFromCities(
  localCities: SliceCity[],
  neighbors: string[],
): SliceArea {
  const labels = new Set<string>();
  const countries = new Set<string>();
  const states = new Set<string>();
  for (const city of localCities) {
    const label = slugify(city.label);
    if (label) labels.add(label);
    const parent = city.parentLabel ? slugify(city.parentLabel) : "";
    if (parent) labels.add(parent);
    const country = normalizeCountry(city.country);
    if (country) countries.add(country);
    const state = normalizeState(city.state);
    if (state) states.add(state);
  }
  return {
    labels,
    countries,
    states,
    neighbors: new Set(neighbors),
  };
}

export function meetingBelongsToSlice(
  meeting: Pick<
    Meeting,
    "attendance" | "city" | "state" | "country" | "geohash4"
  >,
  area: SliceArea,
): boolean {
  if (meeting.geohash4 && area.neighbors.has(meeting.geohash4)) return true;
  if (meeting.attendance !== "online") return false;
  const city = meeting.city ? slugify(meeting.city) : "";
  if (!city || !area.labels.has(city)) return false;
  const country = normalizeCountry(meeting.country);
  if (!country || !area.countries.has(country)) return false;
  const state = normalizeState(meeting.state);
  if (state && area.states.size > 0 && !area.states.has(state)) return false;
  return true;
}
