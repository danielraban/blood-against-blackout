import { and, eq, gte, isNotNull, ne, or, sql } from "drizzle-orm";
import { feeds, meetings } from "./schema";
import { SOURCE_FRESHNESS_HOURS } from "./verification-policy";

export {
  isSourceFresh,
  SOURCE_FRESHNESS_HOURS,
  SOURCE_FRESHNESS_MS,
} from "./verification-policy";

export function freshFeedPredicate() {
  return and(
    eq(feeds.status, "ok"),
    gte(
      feeds.lastOkAt,
      sql`now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')`,
    ),
  );
}

export function safeMeetingPredicate() {
  return and(
    isNotNull(meetings.day),
    isNotNull(meetings.time),
    or(
      eq(meetings.attendance, "online"),
      and(
        ne(meetings.attendance, "online"),
        isNotNull(meetings.formattedAddress),
        isNotNull(meetings.city),
        isNotNull(meetings.lat),
        isNotNull(meetings.lng),
        sql<boolean>`lower(btrim(${meetings.city})) not in ('online', 'virtual', 'regional')`,
        sql<boolean>`btrim(${meetings.city}) !~ '^[A-Z]{2,3}$'`,
        sql<boolean>`length(btrim(${meetings.city})) <= 80`,
      ),
    ),
  );
}
