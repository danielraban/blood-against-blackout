import { readSlice, writeSlice } from "./idb";
import type { SlicePayload } from "./types";

export function sliceLoadStatus(slice: SlicePayload) {
  if (!slice.meetings.length) return "No public feed covers this area yet";
  if (slice.truncated) {
    return `${slice.meetings.length} listings in this area (capped — search a city or tighten filters)`;
  }
  return `${slice.meetings.length} listings in this area`;
}

export async function loadSlicePayload(
  hash: string,
  onCached?: (slice: SlicePayload, stale: boolean) => void,
) {
  const cached = await readSlice(hash);
  if (cached?.slice) onCached?.(cached.slice, Boolean(cached.stale));
  const response = await fetch(`/api/slices/${hash}`);
  if (!response.ok) {
    if (cached?.slice) {
      return { slice: cached.slice, offline: true as const };
    }
    throw new Error("Could not load this area");
  }
  const data = (await response.json()) as SlicePayload;
  await writeSlice(data);
  return { slice: data, offline: false as const };
}
