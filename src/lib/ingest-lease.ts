import type { feeds } from "./schema";

export const FEED_LEASE_SECONDS = 6 * 60;

export type ClaimedFeed = typeof feeds.$inferSelect;

export function mapClaimedFeedRow(row: Record<string, unknown>): ClaimedFeed | null {
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.url !== "string") {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    regionHint: textOrNull(row.region_hint),
    fellowship: typeof row.fellowship === "string" ? row.fellowship : "aa",
    format: typeof row.format === "string" ? row.format : "tsml",
    status: typeof row.status === "string" ? row.status : "pending",
    lastAttemptAt: dateOrNull(row.last_attempt_at),
    lastOkAt: dateOrNull(row.last_ok_at),
    lastError: textOrNull(row.last_error),
    meetingCount: numberOrZero(row.meeting_count),
    etag: textOrNull(row.etag),
    lastModified: textOrNull(row.last_modified),
    leasedUntil: dateOrNull(row.leased_until),
  };
}

export function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function textOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function dateOrNull(value: unknown) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
