import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Meeting, SlicePayload } from "./types";

const SLICE_TTL_MS = 12 * 60 * 60 * 1000;

type PlaceKind = "home" | "work" | "travel";

export type SavedPlace = {
  kind: PlaceKind;
  label: string;
  geohash4: string;
  lat: number;
  lng: number;
  citySlug?: string;
};

interface OpenChairDB extends DBSchema {
  slices: {
    key: string;
    value: SlicePayload;
  };
  favorites: {
    key: string;
    value: Meeting;
  };
  places: {
    key: PlaceKind;
    value: SavedPlace;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<OpenChairDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OpenChairDB>("openchair", 1, {
      upgrade(db) {
        db.createObjectStore("slices");
        db.createObjectStore("favorites");
        db.createObjectStore("places");
        db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

export async function readSlice(geohash: string) {
  const db = await getDb();
  const slice = await db.get("slices", geohash);
  if (!slice) return null;
  if (Date.now() - new Date(slice.fetchedAt).getTime() > SLICE_TTL_MS) {
    return { slice, stale: true as const };
  }
  return { slice, stale: false as const };
}

export async function writeSlice(slice: SlicePayload) {
  const db = await getDb();
  await db.put("slices", slice, slice.geohash);
}

export async function listFavorites() {
  const db = await getDb();
  return db.getAll("favorites");
}

export function favoriteKey(meeting: Pick<Meeting, "feedId" | "slug">) {
  return `${meeting.feedId}:${meeting.slug}`;
}

export async function isFavorite(meeting: Pick<Meeting, "feedId" | "slug">) {
  const db = await getDb();
  return Boolean(await db.get("favorites", favoriteKey(meeting)));
}

export async function toggleFavorite(meeting: Meeting) {
  const db = await getDb();
  const key = favoriteKey(meeting);
  const existing = await db.get("favorites", key);
  if (existing) {
    await db.delete("favorites", key);
    return false;
  }
  await db.put("favorites", meeting, key);
  return true;
}

export async function savePlace(place: SavedPlace) {
  const db = await getDb();
  await db.put("places", place, place.kind);
}

export async function listPlaces() {
  const db = await getDb();
  return db.getAll("places");
}

export async function getMeta<T>(key: string) {
  const db = await getDb();
  return (await db.get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  const db = await getDb();
  await db.put("meta", value, key);
}
