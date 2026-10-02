import { FILTER_TYPE_CODES } from "./spec";
import type { SearchFilters } from "./types";

export const ASK_SUGGESTIONS = [
  { label: "beginners tonight", text: "beginners tonight", needsArea: true },
  { label: "door code", text: "door code", needsArea: true },
  { label: "what should I expect", text: "what should I expect at a meeting?", needsArea: false },
] as const;

export type AskListingKey = {
  feedId: string;
  slug: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toolName(part: Record<string, unknown>) {
  if (typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "";
}

function listingKey(value: unknown): AskListingKey | null {
  const record = asRecord(value);
  if (!record) return null;
  const feedId = typeof record.feedId === "string" ? record.feedId.trim() : "";
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  if (!feedId || !slug) return null;
  return { feedId, slug };
}

export function parseMeetingFilters(input: unknown): Partial<SearchFilters> {
  const record = asRecord(input);
  if (!record) return {};
  const next: Partial<SearchFilters> = {};
  if (record.fellowship === "all" || record.fellowship === "aa" || record.fellowship === "na" || record.fellowship === "ca") {
    next.fellowship = record.fellowship;
  }
  if (
    record.attendance === "in-person" ||
    record.attendance === "online" ||
    record.attendance === "either"
  ) {
    next.attendance = record.attendance;
  }
  if (record.day === "today" || record.day === "any") next.day = record.day;
  if (typeof record.day === "number" && Number.isInteger(record.day) && record.day >= 0 && record.day <= 6) {
    next.day = record.day;
  }
  if (
    record.timeWindow === "any" ||
    record.timeWindow === "morning" ||
    record.timeWindow === "afternoon" ||
    record.timeWindow === "evening"
  ) {
    next.timeWindow = record.timeWindow;
  }
  if (record.openClosed === "any" || record.openClosed === "O" || record.openClosed === "C") {
    next.openClosed = record.openClosed;
  }
  if (Array.isArray(record.types)) {
    next.types = record.types.filter(
      (code): code is (typeof FILTER_TYPE_CODES)[number] =>
        typeof code === "string" &&
        (FILTER_TYPE_CODES as readonly string[]).includes(code),
    );
  }
  if (typeof record.query === "string") next.query = record.query.slice(0, 80);
  if (typeof record.week === "boolean") next.week = record.week;
  return next;
}

export function listingKeysFromAskParts(parts: unknown[]): AskListingKey[] {
  const keys: AskListingKey[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const record = asRecord(part);
    if (!record || record.state !== "output-available") continue;
    const name = toolName(record);
    const output = asRecord(record.output);
    const rows =
      name === "searchMeetings"
        ? output?.meetings
        : name === "searchNotes"
          ? output?.notes
          : null;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const key = listingKey(row);
      if (!key) continue;
      const id = `${key.feedId}:${key.slug}`;
      if (seen.has(id)) continue;
      seen.add(id);
      keys.push(key);
    }
  }
  return keys;
}

export function filtersFromAskParts(parts: unknown[]): Partial<SearchFilters> | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const record = asRecord(parts[index]);
    if (!record || record.state !== "output-available") continue;
    if (toolName(record) !== "searchMeetings") continue;
    const filters = parseMeetingFilters(record.input);
    return Object.keys(filters).length ? filters : null;
  }
  return null;
}

export function askFilterCallId(parts: unknown[]) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const record = asRecord(parts[index]);
    if (!record || record.state !== "output-available") continue;
    if (toolName(record) !== "searchMeetings") continue;
    return typeof record.toolCallId === "string" ? record.toolCallId : null;
  }
  return null;
}

export function mergeAskFilters(
  current: SearchFilters,
  incoming: Partial<SearchFilters>,
): SearchFilters {
  return {
    ...current,
    ...incoming,
    radiusKm: current.radiusKm,
    types: incoming.types ?? current.types,
    query: incoming.query ?? current.query,
  };
}
