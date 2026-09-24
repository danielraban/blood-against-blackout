import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "./db";
import { cities, entities, feeds, geocodeCache, ingestCatalog, ingestRuns, meetings } from "./schema";
import { encodeGeohash4 } from "./geo";
import { slugify } from "./utils";
import { asFellowship, asFeedFormat } from "./fellowship";
import {
  asMeetingArray,
  bmltSearchUrl,
  dedupeMeetingsBySlug,
  parseFeedMeetings,
  parseTsmlMeeting,
  type RawMeeting,
} from "./parse-feed";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertPublicHttpsUrl } from "./url-security";
import {
  canonicalFeedUrl,
  DUPLICATE_FEED_IDS,
  fallbackFeedUrls,
  feedIdsToReplaceForCatalog,
  isProbablyJson,
} from "./feed-url";
import { applyRegionHint, isUsableCityLabel, locationNeedsEnrichment, normalizePlaceFields } from "./location";
import { SOURCE_FRESHNESS_HOURS } from "./verification";
import {
  CITIES_CLEAN,
  CITIES_DIRTY,
  hashFeedCatalog,
  INGEST_CATALOG_ID,
  INGEST_CITIES_ID,
} from "./ingest-catalog";
import { feedClaimSql } from "./ingest-claim";
import {
  borrowVenueCoordinates,
  POSTCODE_GEOCODE_LIMIT,
  postcodeGeocodeQuery,
  uniqueGeocodeQueries,
} from "./geocode-batch";
import {
  FEED_LEASE_SECONDS,
  mapClaimedFeedRow,
  resultRows,
  type ClaimedFeed,
} from "./ingest-lease";
import { runWithConcurrency } from "./ingest-queue";
import { scheduleNominatim } from "./nominatim-limit";
import {
  canUseAiCanonicalization,
  enrichPlace,
  type PlaceEnrichmentBudget,
} from "./canonicalize-place";

const feedsCatalogJson = readFileSync(join(process.cwd(), "src/data/feeds.json"), "utf8");
const bmltCatalogJson = readFileSync(join(process.cwd(), "src/data/bmlt-servers.json"), "utf8");

const seedFeeds = JSON.parse(feedsCatalogJson) as {
  id: string;
  name: string;
  url: string;
  regionHint: string;
  fellowship?: string;
  format?: string;
  status?: "disabled";
}[];

const bmltServers = JSON.parse(bmltCatalogJson) as {
  id: string;
  name: string;
  url: string;
  regionHint: string;
  status?: "disabled";
}[];

export function parseRawMeeting(raw: RawMeeting, feedId: string) {
  return parseTsmlMeeting(raw, feedId, "aa");
}

const FEED_USER_AGENTS = [
  "blood-against-blackout/1.0 (meeting finder)",
  "Mozilla/5.0 (compatible; MeetingGuide; OpenChair)",
];

export const DEFAULT_INGEST_LIMIT = 20;
export const MAX_INGEST_LIMIT = 32;
export const INGEST_TIME_BUDGET_MS = 240_000;
export const INGEST_CONCURRENCY = 4;

type FeedPayload =
  | { status: "not-modified" }
  | {
      status: "ok";
      meetings: RawMeeting[];
      etag: string | null;
      lastModified: string | null;
    };

type ConditionalHeaders = {
  etag?: string | null;
  lastModified?: string | null;
};

async function readMeetingJson(url: string, validators?: ConditionalHeaders) {
  let lastError: Error = new Error("Feed fetch failed");
  for (const userAgent of FEED_USER_AGENTS) {
    try {
      return await readMeetingJsonWithAgent(url, userAgent, validators);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Feed fetch failed");
    }
  }
  throw lastError;
}

async function readMeetingJsonWithAgent(
  url: string,
  userAgent: string,
  validators?: ConditionalHeaders,
): Promise<FeedPayload> {
  let current = await assertPublicHttpsUrl(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const headers: Record<string, string> = {
      Accept: "application/json, text/javascript, */*",
      "User-Agent": userAgent,
    };
    if (validators?.etag) headers["If-None-Match"] = validators.etag;
    if (validators?.lastModified) headers["If-Modified-Since"] = validators.lastModified;
    const response = await fetch(current, {
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 304) {
      return { status: "not-modified" };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Unsafe or excessive feed redirects");
      current = await assertPublicHttpsUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.text();
    if (!isProbablyJson(response.headers.get("content-type"), body)) {
      throw new Error("Feed did not return JSON");
    }
    try {
      return {
        status: "ok",
        meetings: asMeetingArray(JSON.parse(body)),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "Feed is not a JSON array") throw error;
      throw new Error("Feed did not return JSON");
    }
  }
  throw new Error("Feed redirect failed");
}

async function fetchJson(
  url: string,
  validators?: ConditionalHeaders,
  useFallbacks = true,
) {
  const tried = new Set<string>();
  const candidates = useFallbacks ? [url, ...fallbackFeedUrls(url)] : [url];
  let lastError: Error | null = null;
  for (const [index, candidate] of candidates.entries()) {
    const key = canonicalFeedUrl(candidate);
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      return await readMeetingJson(candidate, index === 0 ? validators : undefined);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Feed fetch failed");
    }
  }
  throw lastError ?? new Error("Feed fetch failed");
}

type GeoPoint = { lat: number; lng: number };

async function loadGeocodeCache(queries: string[]) {
  const cache = new Map<string, GeoPoint>();
  const db = getDb();
  for (let index = 0; index < queries.length; index += 200) {
    const chunk = queries.slice(index, index + 200);
    if (chunk.length === 0) continue;
    const rows = await db
      .select()
      .from(geocodeCache)
      .where(inArray(geocodeCache.query, chunk));
    for (const row of rows) cache.set(row.query, { lat: row.lat, lng: row.lng });
  }
  return cache;
}

async function fetchNominatimSearch(query: string): Promise<GeoPoint | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      "User-Agent": "blood-against-blackout/1.0 (meeting finder)",
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { lat: string; lon: string }[];
  if (!data[0]) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

class GeocodeLookup {
  private points = new Map<string, GeoPoint | null>();
  private inflight = new Map<string, Promise<GeoPoint | null>>();

  async preload(queries: string[]) {
    const missing = queries.filter((query) => !this.points.has(query));
    if (missing.length === 0) return;
    const loaded = await loadGeocodeCache(missing);
    for (const [query, point] of loaded) this.points.set(query, point);
  }

  cached(query: string): GeoPoint | null | undefined {
    if (!this.points.has(query)) return undefined;
    return this.points.get(query) ?? null;
  }

  resolve(query: string): Promise<GeoPoint | null> {
    if (this.points.has(query)) return Promise.resolve(this.points.get(query) ?? null);
    const pending = this.inflight.get(query);
    if (pending) return pending;
    const request = this.fetch(query);
    this.inflight.set(query, request);
    return request;
  }

  private async fetch(query: string): Promise<GeoPoint | null> {
    try {
      const resolved = await scheduleNominatim(async () => {
        if (this.points.has(query)) {
          return { point: this.points.get(query) ?? null, store: false };
        }
        const fetched = await fetchNominatimSearch(query);
        return { point: fetched, store: Boolean(fetched) };
      });
      if (resolved.store && resolved.point) {
        this.points.set(query, resolved.point);
        await getDb()
          .insert(geocodeCache)
          .values({
            query,
            lat: resolved.point.lat,
            lng: resolved.point.lng,
            cachedAt: new Date(),
          })
          .onConflictDoNothing();
        return resolved.point;
      }
      if (!this.points.has(query)) this.points.set(query, resolved.point);
      return this.points.get(query) ?? null;
    } finally {
      this.inflight.delete(query);
    }
  }
}

export async function seedFeedCatalog(options: { force?: boolean } = {}) {
  const db = getDb();
  const contentHash = hashFeedCatalog(feedsCatalogJson, bmltCatalogJson);
  if (!options.force) {
    const [saved] = await db
      .select({ contentHash: ingestCatalog.contentHash })
      .from(ingestCatalog)
      .where(eq(ingestCatalog.id, INGEST_CATALOG_ID))
      .limit(1);
    if (saved?.contentHash === contentHash) return;
  }
  const existing = await db.select({ id: feeds.id, url: feeds.url }).from(feeds);
  const catalog: { id: string; url: string }[] = [];
  const seenUrls = new Set<string>();
  for (const feed of seedFeeds) {
    const url = canonicalFeedUrl(feed.url);
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    catalog.push({ id: feed.id, url });
  }
  for (const server of bmltServers) {
    const url = canonicalFeedUrl(bmltSearchUrl(server.url));
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    catalog.push({ id: server.id, url });
  }
  const replaceIds = [
    ...new Set([
      ...feedIdsToReplaceForCatalog(catalog, existing),
      ...DUPLICATE_FEED_IDS.filter(
        (id) => !catalog.some((row) => row.id === id),
      ),
    ]),
  ];
  if (replaceIds.length) {
    await db.delete(feeds).where(inArray(feeds.id, replaceIds));
  }
  seenUrls.clear();
  for (const feed of seedFeeds) {
    const url = canonicalFeedUrl(feed.url);
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const status = feed.status === "disabled" ? "disabled" : "pending";
    await db
      .insert(feeds)
      .values({
        id: feed.id,
        name: feed.name,
        url,
        regionHint: feed.regionHint,
        fellowship: asFellowship(feed.fellowship),
        format: asFeedFormat(feed.format),
        status,
        lastError: status === "disabled" ? "No public JSON feed" : null,
      })
      .onConflictDoUpdate({
        target: feeds.id,
        set: {
          name: feed.name,
          url,
          regionHint: feed.regionHint,
          fellowship: asFellowship(feed.fellowship),
          format: asFeedFormat(feed.format),
          ...(status === "disabled"
            ? { status, lastError: "No public JSON feed" }
            : {
                status: sql`case when ${feeds.status} = 'disabled' then 'pending' else ${feeds.status} end`,
                lastError: sql`case when ${feeds.status} = 'disabled' then null else ${feeds.lastError} end`,
              }),
        },
      });
  }
  for (const server of bmltServers) {
    const url = canonicalFeedUrl(bmltSearchUrl(server.url));
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const status = server.status === "disabled" ? "disabled" : "pending";
    await db
      .insert(feeds)
      .values({
        id: server.id,
        name: server.name,
        url,
        regionHint: server.regionHint,
        fellowship: "na",
        format: "bmlt",
        status,
        lastError: status === "disabled" ? "No public JSON feed" : null,
      })
      .onConflictDoUpdate({
        target: feeds.id,
        set: {
          name: server.name,
          url,
          regionHint: server.regionHint,
          fellowship: "na",
          format: "bmlt",
          ...(status === "disabled"
            ? { status, lastError: "No public JSON feed" }
            : {
                status: sql`case when ${feeds.status} = 'disabled' then 'pending' else ${feeds.status} end`,
                lastError: sql`case when ${feeds.status} = 'disabled' then null else ${feeds.lastError} end`,
              }),
        },
      });
  }
  await db
    .insert(ingestCatalog)
    .values({ id: INGEST_CATALOG_ID, contentHash, seededAt: new Date() })
    .onConflictDoUpdate({
      target: ingestCatalog.id,
      set: { contentHash, seededAt: new Date() },
    });
}

export async function rebuildCities() {
  const db = getDb();
  await db.batch([
    db.delete(cities),
    db.execute(sql`
      with eligible as (
        select
          m.*,
          case when m.country is null then substring(m.geohash4 from 1 for 3) else '' end as identity_scope,
          substring(m.geohash4 from 1 for 3) as geo_cluster
        from meetings m
        inner join feeds f on f.id = m.feed_id
        where m.city is not null
          and lower(m.city) not in ('online', 'virtual', 'regional')
          and m.day is not null
          and m.time is not null
          and (
            m.attendance = 'online'
            or (
              m.formatted_address is not null
              and m.lat is not null
              and m.lng is not null
            )
          )
          and f.status = 'ok'
          and f.last_ok_at >= now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')
      ),
      city_cluster_counts as (
        select city, state, country, identity_scope, geo_cluster, count(*) as cluster_count
        from eligible
        where geo_cluster is not null
        group by city, state, country, identity_scope, geo_cluster
      ),
      city_dominant as (
        select city, state, country, identity_scope, geo_cluster
        from (
          select *, row_number() over (
            partition by city, state, country, identity_scope
            order by cluster_count desc, geo_cluster
          ) as cluster_rank
          from city_cluster_counts
        ) ranked_clusters
        where cluster_rank = 1
      ),
      neighborhood_cluster_counts as (
        select neighborhood, city, state, country, identity_scope, geo_cluster, count(*) as cluster_count
        from eligible
        where geo_cluster is not null
          and neighborhood is not null
          and btrim(neighborhood) <> ''
          and lower(neighborhood) <> lower(city)
        group by neighborhood, city, state, country, identity_scope, geo_cluster
      ),
      neighborhood_dominant as (
        select neighborhood, city, state, country, identity_scope, geo_cluster
        from (
          select *, row_number() over (
            partition by neighborhood, city, state, country, identity_scope
            order by cluster_count desc, geo_cluster
          ) as cluster_rank
          from neighborhood_cluster_counts
        ) ranked_clusters
        where cluster_rank = 1
      ),
      city_aggregated as (
        select
          trim(both '-' from regexp_replace(lower(e.city), '[^[:alnum:]]+', '-', 'g'))
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.state), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.country), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || case when e.country is null then '-' || coalesce(e.identity_scope, 'geo') else '' end as slug,
          e.city as label,
          null::text as parent_label,
          array[e.city]::text[] as aliases,
          e.state,
          e.country,
          coalesce(
            avg(e.lat) filter (where e.attendance = 'in-person'),
            avg(e.lat)
          )::real as lat,
          coalesce(
            avg(e.lng) filter (where e.attendance = 'in-person'),
            avg(e.lng)
          )::real as lng,
          coalesce(
            mode() within group (order by e.geohash4) filter (where e.attendance = 'in-person'),
            mode() within group (order by e.geohash4)
          ) as geohash4,
          count(*)::int as meeting_count
        from eligible e
        inner join city_dominant d
          on d.city = e.city
          and d.state is not distinct from e.state
          and d.country is not distinct from e.country
          and d.identity_scope = e.identity_scope
          and d.geo_cluster = e.geo_cluster
        group by e.city, e.state, e.country, e.identity_scope
      ),
      neighborhood_aggregated as (
        select
          trim(both '-' from regexp_replace(lower(e.neighborhood), '[^[:alnum:]]+', '-', 'g'))
            || '-' || trim(both '-' from regexp_replace(lower(e.city), '[^[:alnum:]]+', '-', 'g'))
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.state), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.country), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || case when e.country is null then '-' || coalesce(e.identity_scope, 'geo') else '' end as slug,
          e.neighborhood as label,
          e.city as parent_label,
          array[
            e.neighborhood,
            e.city,
            e.neighborhood || ', ' || e.city
          ]::text[] as aliases,
          e.state,
          e.country,
          coalesce(
            avg(e.lat) filter (where e.attendance = 'in-person'),
            avg(e.lat)
          )::real as lat,
          coalesce(
            avg(e.lng) filter (where e.attendance = 'in-person'),
            avg(e.lng)
          )::real as lng,
          coalesce(
            mode() within group (order by e.geohash4) filter (where e.attendance = 'in-person'),
            mode() within group (order by e.geohash4)
          ) as geohash4,
          count(*)::int as meeting_count
        from eligible e
        inner join neighborhood_dominant d
          on d.neighborhood = e.neighborhood
          and d.city = e.city
          and d.state is not distinct from e.state
          and d.country is not distinct from e.country
          and d.identity_scope = e.identity_scope
          and d.geo_cluster = e.geo_cluster
        group by e.neighborhood, e.city, e.state, e.country, e.identity_scope
      ),
      aggregated as (
        select * from city_aggregated
        union all
        select * from neighborhood_aggregated
      ),
      unique_places as (
        select *
        from (
          select *, row_number() over (
            partition by
              label,
              coalesce(state, ''),
              coalesce(country, ''),
              geohash4
            order by
              case when parent_label is null then 0 else 1 end,
              meeting_count desc,
              slug
          ) as place_rank
          from aggregated
        ) places
        where place_rank = 1
      ),
      ranked as (
        select *, row_number() over (
          partition by slug order by meeting_count desc, label
        ) as rank
        from unique_places
      )
      insert into cities (slug, label, state, country, lat, lng, geohash4, meeting_count, parent_label, aliases)
      select slug, label, state, country, lat, lng, geohash4, meeting_count, parent_label, aliases
      from ranked
      where rank = 1
    `),
  ]);
}

type IngestStats = {
  feedsClaimed: number;
  feedsProcessed: number;
  feedsOk: number;
  feedsFail: number;
  feedsNotModified: number;
  feedsWritten: number;
  meetingsUpserted: number;
  budgetExhausted: number;
  feedsBehindFreshness: number;
  errors: string[];
};

function emptyStats(): IngestStats {
  return {
    feedsClaimed: 0,
    feedsProcessed: 0,
    feedsOk: 0,
    feedsFail: 0,
    feedsNotModified: 0,
    feedsWritten: 0,
    meetingsUpserted: 0,
    budgetExhausted: 0,
    feedsBehindFreshness: 0,
    errors: [],
  };
}

function claimedFeeds(result: unknown) {
  return resultRows<Record<string, unknown>>(result).flatMap((row) => {
    const feed = mapClaimedFeedRow(row);
    return feed ? [feed] : [];
  });
}

async function claimStaleFeeds(limit: number, startedAt: Date) {
  const result = await getDb().execute(
    feedClaimSql({ limit, startedBefore: startedAt.toISOString() }),
  );
  return claimedFeeds(result);
}

async function claimFeedById(id: string) {
  const result = await getDb().execute(feedClaimSql({ feedId: id }));
  return claimedFeeds(result);
}

async function releaseLeases(ids: string[]) {
  if (ids.length === 0) return;
  await getDb().update(feeds).set({ leasedUntil: null }).where(inArray(feeds.id, ids));
}

async function setCitiesMarker(contentHash: string) {
  await getDb()
    .insert(ingestCatalog)
    .values({ id: INGEST_CITIES_ID, contentHash, seededAt: new Date() })
    .onConflictDoUpdate({
      target: ingestCatalog.id,
      set: { contentHash, seededAt: new Date() },
    });
}

function markCitiesDirty() {
  return setCitiesMarker(CITIES_DIRTY);
}

function markCitiesClean() {
  return setCitiesMarker(CITIES_CLEAN);
}

async function citiesAreDirty() {
  const [row] = await getDb()
    .select({ contentHash: ingestCatalog.contentHash })
    .from(ingestCatalog)
    .where(eq(ingestCatalog.id, INGEST_CITIES_ID))
    .limit(1);
  return row?.contentHash === CITIES_DIRTY;
}

async function countFeedsBehindFreshness() {
  const rows = resultRows<{ count: number | string }>(
    await getDb().execute(sql`
      select count(*)::int as count
      from feeds
      where status <> 'disabled'
        and (
          last_ok_at is null
          or last_ok_at < now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')
        )
    `),
  );
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function summarize(stats: IngestStats) {
  return {
    feedsClaimed: stats.feedsClaimed,
    feedsProcessed: stats.feedsProcessed,
    feedsOk: stats.feedsOk,
    feedsFail: stats.feedsFail,
    feedsNotModified: stats.feedsNotModified,
    feedsWritten: stats.feedsWritten,
    meetingsUpserted: stats.meetingsUpserted,
    budgetExhausted: stats.budgetExhausted,
    feedsBehindFreshness: stats.feedsBehindFreshness,
    errors: stats.errors,
  };
}

async function openIngestRun(startedAt: Date) {
  const db = getDb();
  await db
    .update(ingestRuns)
    .set({ status: "incomplete", finishedAt: new Date() })
    .where(
      and(
        eq(ingestRuns.status, "running"),
        lt(ingestRuns.startedAt, new Date(Date.now() - 10 * 60 * 1000)),
      ),
    );
  const insertedRuns = await db
    .insert(ingestRuns)
    .values({ startedAt, status: "running" })
    .returning({ id: ingestRuns.id });
  return insertedRuns[0]?.id;
}

async function finishIngestRun(runId: number | undefined, stats: IngestStats) {
  if (runId == null) return;
  const notes = [...stats.errors];
  if (stats.budgetExhausted > 0) {
    notes.push(`Stopped: time budget exhausted with ${stats.budgetExhausted} feeds unstarted`);
  }
  await getDb()
    .update(ingestRuns)
    .set({
      finishedAt: new Date(),
      feedsOk: stats.feedsOk,
      feedsFail: stats.feedsFail,
      meetingsUpserted: stats.meetingsUpserted,
      errorSummary: notes.slice(0, 20).join("\n") || null,
      status:
        stats.feedsFail > 0 || stats.errors.length > 0
          ? "completed_with_errors"
          : "completed",
    })
    .where(eq(ingestRuns.id, runId));
}

async function ingestFeed(
  feed: ClaimedFeed,
  enrichmentBudget: PlaceEnrichmentBudget,
  stats: IngestStats,
  geocodes: GeocodeLookup,
) {
  const db = getDb();
  const attemptedAt = new Date();
  stats.feedsProcessed += 1;
  await db
    .update(feeds)
    .set({ leasedUntil: new Date(Date.now() + FEED_LEASE_SECONDS * 1000) })
    .where(eq(feeds.id, feed.id));
  try {
    const fellowship = asFellowship(feed.fellowship);
    const format = asFeedFormat(feed.format);
    const payload = await fetchJson(
      feed.url,
      {
        etag: feed.etag,
        lastModified: feed.lastModified,
      },
      format !== "oiaa",
    );
    if (payload.status === "not-modified") {
      await db
        .update(feeds)
        .set({
          status: "ok",
          lastAttemptAt: attemptedAt,
          lastOkAt: attemptedAt,
          lastError: null,
          leasedUntil: null,
        })
        .where(eq(feeds.id, feed.id));
      stats.feedsOk += 1;
      stats.feedsNotModified += 1;
      return;
    }
    const raw = payload.meetings;
    const parsed = raw
      .flatMap((item) => parseFeedMeetings(item, feed.id, fellowship, format))
      .map((item) => {
        const jurisdiction = applyRegionHint(item, feed.regionHint);
        const place = normalizePlaceFields({
          city: isUsableCityLabel(item.city) ? item.city : null,
          neighborhood: item.neighborhood,
          state: jurisdiction.state,
          postalCode: item.postalCode,
          country: jurisdiction.country,
        });
        return {
          ...item,
          ...place,
        };
      });

    const entityRows = new Map<string, typeof entities.$inferInsert>();
    for (const item of parsed) {
      if (!item.entityName) continue;
      const entityId = `${feed.id}:${slugify(item.entityName)}`;
      if (!entityRows.has(entityId)) {
        entityRows.set(entityId, {
          id: entityId,
          feedId: feed.id,
          name: item.entityName,
          phone: item.entityPhone,
          email: item.entityEmail,
          url: item.entityUrl,
          locationText: item.entityLocation,
          feedbackEmails: item.feedbackEmails,
        });
      }
    }

    const placed = borrowVenueCoordinates(parsed);
    let geocodeBudget = 3;
    let postcodeBudget = POSTCODE_GEOCODE_LIMIT;
    const cityGeo = new Map<string, { lat: number; lng: number }>();
    await geocodes.preload(uniqueGeocodeQueries(placed));
    const meetingRows: (typeof meetings.$inferInsert)[] = [];
    const chunkSize = 80;
    for (const item of placed) {
      let lat = item.lat;
      let lng = item.lng;
      let geohash4 = item.geohash4;
      let attendance = item.attendance;
      let types = item.types;
      const postcodeQuery = postcodeGeocodeQuery(item);
      if (
        (lat == null || lng == null) &&
        attendance !== "online" &&
        postcodeQuery
      ) {
        const known = geocodes.cached(postcodeQuery);
        if (known) {
          lat = known.lat;
          lng = known.lng;
          geohash4 = encodeGeohash4(known.lat, known.lng);
        } else if (known === undefined && postcodeBudget > 0) {
          postcodeBudget -= 1;
          const geo = await geocodes.resolve(postcodeQuery);
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
            geohash4 = encodeGeohash4(geo.lat, geo.lng);
          }
        }
      } else if (
        (lat == null || lng == null) &&
        attendance !== "online" &&
        item.formattedAddress &&
        geocodeBudget > 0
      ) {
        const geo = await geocodes.resolve(item.formattedAddress);
        geocodeBudget -= 1;
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          geohash4 = encodeGeohash4(geo.lat, geo.lng);
        }
      }
      if ((lat == null || lng == null) && attendance !== "online" && item.city && !item.postalCode) {
        const cityKey = [item.city, item.state, item.country].filter(Boolean).join(", ");
        let geo = cityGeo.get(cityKey);
        if (!geo && cityGeo.size < 12) {
          const resolved = await geocodes.resolve(cityKey);
          if (resolved) {
            geo = resolved;
            cityGeo.set(cityKey, resolved);
          }
        }
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          geohash4 = encodeGeohash4(geo.lat, geo.lng);
        }
      }
      if ((lat == null || lng == null) && item.conferenceUrl) {
        attendance = "online";
        if (!types.includes("ONL")) types = [...types, "ONL"];
      }
      if (attendance !== "online" && (lat == null || lng == null)) {
        continue;
      }
      if (attendance === "online" && !geohash4 && item.city) {
        const cityKey = [item.city, item.state, item.country].filter(Boolean).join(", ");
        let geo = cityGeo.get(cityKey);
        if (!geo && cityGeo.size < 12) {
          const resolved = await geocodes.resolve(cityKey);
          if (resolved) {
            geo = resolved;
            cityGeo.set(cityKey, resolved);
          }
        }
        if (geo) geohash4 = encodeGeohash4(geo.lat, geo.lng);
      }
      if (item.day == null || item.time == null) {
        continue;
      }
      if (attendance !== "online" && !item.formattedAddress) {
        continue;
      }
      let city = item.city;
      let neighborhood = item.neighborhood;
      let state = item.state;
      let postalCode = item.postalCode;
      let country = item.country;
      const currentPlace = { city, neighborhood, state, postalCode, country };
      if (locationNeedsEnrichment(currentPlace)) {
        const enriched = await enrichPlace(currentPlace, lat, lng, enrichmentBudget);
        city = enriched.city;
        neighborhood = enriched.neighborhood;
        state = enriched.state;
        postalCode = enriched.postalCode;
        country = enriched.country;
      }
      if (attendance !== "online" && !city) {
        continue;
      }
      meetingRows.push({
        feedId: item.feedId,
        slug: item.slug,
        name: item.name,
        groupName: item.groupName,
        day: item.day,
        time: item.time,
        endTime: item.endTime,
        timezone: item.timezone,
        types,
        attendance,
        fellowship: item.fellowship,
        locationName: item.locationName,
        address: item.address,
        city,
        neighborhood,
        state,
        postalCode,
        country,
        formattedAddress: item.formattedAddress,
        lat,
        lng,
        geohash4,
        conferenceUrl: item.conferenceUrl,
        conferencePhone: item.conferencePhone,
        notes: item.notes,
        locationNotes: item.locationNotes,
        updatedAt: item.updatedAt,
        verifiedAt: attemptedAt,
        entityId: item.entityName ? `${feed.id}:${slugify(item.entityName)}` : null,
      });
    }
    const uniqueMeetingRows = dedupeMeetingsBySlug(meetingRows);
    if (parsed.length > 0 && uniqueMeetingRows.length === 0) {
      throw new Error("Feed parsed but produced no usable meetings");
    }

    const operations: BatchItem<"pg">[] = [];
    const uniqueEntities = [...entityRows.values()];
    for (let i = 0; i < uniqueEntities.length; i += chunkSize) {
      const chunk = uniqueEntities.slice(i, i + chunkSize);
      operations.push(
        db
          .insert(entities)
          .values(chunk)
          .onConflictDoUpdate({
            target: entities.id,
            set: {
              name: sql`excluded.name`,
              phone: sql`excluded.phone`,
              email: sql`excluded.email`,
              url: sql`excluded.url`,
              locationText: sql`excluded.location_text`,
              feedbackEmails: sql`excluded.feedback_emails`,
            },
          }),
      );
    }
    operations.push(db.delete(meetings).where(eq(meetings.feedId, feed.id)));
    for (let i = 0; i < uniqueMeetingRows.length; i += chunkSize) {
      const chunk = uniqueMeetingRows.slice(i, i + chunkSize);
      operations.push(
        db
          .insert(meetings)
          .values(chunk)
          .onConflictDoUpdate({
            target: [meetings.feedId, meetings.slug],
            set: {
              name: sql`excluded.name`,
              groupName: sql`excluded.group_name`,
              day: sql`excluded.day`,
              time: sql`excluded.time`,
              endTime: sql`excluded.end_time`,
              timezone: sql`excluded.timezone`,
              types: sql`excluded.types`,
              attendance: sql`excluded.attendance`,
              fellowship: sql`excluded.fellowship`,
              locationName: sql`excluded.location_name`,
              address: sql`excluded.address`,
              city: sql`excluded.city`,
              neighborhood: sql`excluded.neighborhood`,
              state: sql`excluded.state`,
              postalCode: sql`excluded.postal_code`,
              country: sql`excluded.country`,
              formattedAddress: sql`excluded.formatted_address`,
              lat: sql`excluded.lat`,
              lng: sql`excluded.lng`,
              geohash4: sql`excluded.geohash4`,
              conferenceUrl: sql`excluded.conference_url`,
              conferencePhone: sql`excluded.conference_phone`,
              notes: sql`excluded.notes`,
              locationNotes: sql`excluded.location_notes`,
              updatedAt: sql`excluded.updated_at`,
              verifiedAt: sql`excluded.verified_at`,
              entityId: sql`excluded.entity_id`,
            },
          }),
      );
    }
    operations.push(
      db
        .update(feeds)
        .set({
          status: "ok",
          lastAttemptAt: attemptedAt,
          lastOkAt: attemptedAt,
          lastError: null,
          meetingCount: uniqueMeetingRows.length,
          etag: payload.etag,
          lastModified: payload.lastModified,
          leasedUntil: null,
        })
        .where(eq(feeds.id, feed.id)),
    );
    await db.batch(operations as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    stats.meetingsUpserted += uniqueMeetingRows.length;
    stats.feedsOk += 1;
    stats.feedsWritten += 1;
  } catch (error) {
    stats.feedsFail += 1;
    const message = error instanceof Error ? error.message : "Unknown error";
    stats.errors.push(`${feed.id}: ${message}`);
    await db
      .update(feeds)
      .set({
        status: "error",
        lastAttemptAt: attemptedAt,
        lastError: message.slice(0, 500),
        leasedUntil: null,
      })
      .where(eq(feeds.id, feed.id));
  }
}

async function runIngest(options: {
  maxMs?: number;
  once: boolean;
  claim: (startedAt: Date) => Promise<ClaimedFeed[]>;
  emptyClaimError?: string;
}) {
  const stats = emptyStats();
  const deadline =
    options.maxMs != null ? Date.now() + options.maxMs : Number.POSITIVE_INFINITY;
  const enrichmentBudget: PlaceEnrichmentBudget = {
    reverse: 12,
    ai: canUseAiCanonicalization() ? 25 : 0,
  };
  const geocodes = new GeocodeLookup();
  if (enrichmentBudget.ai === 0) {
    console.warn(
      "place.canonicalize.ai_skipped: no AI Gateway auth in this process; using rules and reverse geocode. For local ingest, add AI_GATEWAY_API_KEY to .env.local.",
    );
  }

  const startedAt = new Date();
  let runId: number | undefined;
  let failure: unknown;
  try {
    runId = await openIngestRun(startedAt);
    while (Date.now() < deadline) {
      const claimed = await options.claim(startedAt);
      if (claimed.length === 0) {
        if (stats.feedsClaimed === 0 && options.emptyClaimError) {
          stats.feedsFail += 1;
          stats.errors.push(options.emptyClaimError);
        }
        break;
      }
      stats.feedsClaimed += claimed.length;
      const leftover = await runWithConcurrency(
        claimed,
        INGEST_CONCURRENCY,
        (feed) => ingestFeed(feed, enrichmentBudget, stats, geocodes),
        () => Date.now() < deadline,
      );
      if (leftover.length > 0) {
        stats.budgetExhausted += leftover.length;
        await releaseLeases(leftover.map((feed) => feed.id));
      }
      if (options.once || stats.budgetExhausted > 0) break;
    }
    if (stats.feedsWritten > 0 || (await citiesAreDirty())) {
      if (stats.feedsWritten > 0) await markCitiesDirty();
      await rebuildCities();
      await markCitiesClean();
    }
  } catch (error) {
    failure = error;
    const message = error instanceof Error ? error.message : "Ingest failed";
    stats.errors.push(message);
  } finally {
    try {
      stats.feedsBehindFreshness = await countFeedsBehindFreshness();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Freshness count failed";
      stats.errors.push(message);
    }
    try {
      await finishIngestRun(runId, stats);
    } catch (error) {
      console.error("ingest.run.finish_failed", {
        message: error instanceof Error ? error.message : "Ingest run failed to finish",
      });
    }
    console.info("ingest.summary", {
      claimed: stats.feedsClaimed,
      notModified: stats.feedsNotModified,
      written: stats.feedsWritten,
      failed: stats.feedsFail,
      budgetExhausted: stats.budgetExhausted,
      feedsBehindFreshness: stats.feedsBehindFreshness,
    });
  }
  if (failure) throw failure;
  return summarize(stats);
}

export async function ingestAllFeeds(
  options: { limit?: number; maxMs?: number } = {},
) {
  await seedFeedCatalog();
  const limited = options.limit != null && options.limit > 0;
  const pageSize = limited ? Math.floor(options.limit as number) : DEFAULT_INGEST_LIMIT;
  return runIngest({
    maxMs: options.maxMs,
    once: limited,
    claim: (startedAt) => claimStaleFeeds(pageSize, startedAt),
  });
}

export async function ingestOneFeed(
  url: string,
  name: string,
  id?: string,
  fellowship?: string,
  format?: string,
) {
  const db = getDb();
  const feedId = id || slugify(name || url);
  const canonical = canonicalFeedUrl(url);
  await db
    .insert(feeds)
    .values({
      id: feedId,
      name: name || feedId,
      url: canonical,
      fellowship: asFellowship(fellowship),
      format: asFeedFormat(format),
      status: "pending",
    })
    .onConflictDoUpdate({
      target: feeds.id,
      set: {
        name: name || feedId,
        url: canonical,
        fellowship: asFellowship(fellowship),
        format: asFeedFormat(format),
        status: "pending",
      },
    });
  return runIngest({
    once: true,
    claim: () => claimFeedById(feedId),
    emptyClaimError: `${feedId}: another ingest already holds this feed`,
  });
}
