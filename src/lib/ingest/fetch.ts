import { inArray } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db";
import { feeds, geocodeCache } from "../schema";
import { asMeetingArray, parseTsmlMeeting, type RawMeeting } from "../parse-feed";
import {
  parseAagbIntergroupHtml,
  parseAagbPrintText,
  type AagbParseOptions,
} from "../parse-aagb-intergroup";
import {
  aagbIntergroupHomes,
  aagbIntergroupSlug,
  aagbMeetingListLinks,
  isBotChallenge,
} from "../parse-aagb-index";
import { parseCaukLocationsHtml } from "../parse-cauk-locations";
import { parseUknaHtml } from "../parse-ukna";
import { extractPdfText } from "../pdf-text";
import { assertPublicHttpsUrl } from "../url-security";
import { canonicalFeedUrl, fallbackFeedUrls, isProbablyJson } from "../feed-url";
import type { ClaimedFeed } from "../ingest-lease";
import { scheduleNominatim } from "../nominatim-limit";

export function parseRawMeeting(raw: RawMeeting, feedId: string) {
  return parseTsmlMeeting(raw, feedId, "aa");
}

const FEED_USER_AGENTS = [
  "blood-against-blackout/1.0 (meeting finder)",
  "Mozilla/5.0 (compatible; MeetingGuide; OpenChair)",
];

const AAGB_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ...FEED_USER_AGENTS,
];

export type FeedPayload =
  | { status: "not-modified" }
  | {
      status: "ok";
      meetings: RawMeeting[];
      etag: string | null;
      lastModified: string | null;
      intergroups?: { id: string; name: string; url: string }[];
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

export async function readAagbHtml(
  url: string,
  validators?: ConditionalHeaders,
  options: AagbParseOptions = {},
  depth = 0,
): Promise<FeedPayload> {
  let lastError: Error = new Error("Feed fetch failed");
  for (const userAgent of AAGB_USER_AGENTS) {
    try {
      return await readAagbHtmlWithAgent(url, userAgent, validators, options, depth);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Feed fetch failed");
    }
  }
  throw lastError;
}

async function readAagbHtmlWithAgent(
  url: string,
  userAgent: string,
  validators: ConditionalHeaders | undefined,
  options: AagbParseOptions,
  depth: number,
): Promise<FeedPayload> {
  const document = await fetchFeedDocument(url, userAgent, validators, "application/pdf,text/html");
  if (document.status === "not-modified") return document;
  if (!document.body.startsWith("%PDF") && isBotChallenge(document.body)) {
    throw new Error("Feed page is a bot challenge");
  }
  const meetings = document.body.startsWith("%PDF")
    ? parseAagbPrintText(extractPdfText(document.bytes))
    : parseAagbIntergroupHtml(document.body, options);
  if (meetings.length === 0 && depth === 0) {
    for (const child of aagbMeetingListLinks(document.body, document.finalUrl).slice(0, 3)) {
      try {
        const nested = await readAagbHtml(child, undefined, options, depth + 1);
        if (nested.status === "ok" && nested.meetings.length > 0) return nested;
      } catch {
        continue;
      }
    }
  }
  if (meetings.length === 0) {
    throw new Error("Intergroup page did not include a meeting list");
  }
  return {
    status: "ok",
    meetings,
    etag: document.etag,
    lastModified: document.lastModified,
  };
}

type FeedDocument =
  | { status: "not-modified" }
  | {
      status: "ok";
      body: string;
      bytes: Buffer;
      etag: string | null;
      lastModified: string | null;
      finalUrl: string;
    };

async function fetchFeedDocument(
  url: string,
  userAgent: string,
  validators: ConditionalHeaders | undefined,
  accept: string,
): Promise<FeedDocument> {
  let current = await assertPublicHttpsUrl(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const headers: Record<string, string> = {
      Accept: accept,
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
    if (response.status === 304) return { status: "not-modified" };
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Unsafe or excessive feed redirects");
      current = await assertPublicHttpsUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: "ok",
      body: bytes.toString("utf8"),
      bytes,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      finalUrl: current.toString(),
    };
  }
  throw new Error("Feed redirect failed");
}

export async function readIndexedHtml(
  feed: ClaimedFeed,
  format: "aagb-region" | "cauk" | "ukna",
  validators?: ConditionalHeaders,
): Promise<FeedPayload> {
  let lastError: Error = new Error("Feed fetch failed");
  for (const userAgent of AAGB_USER_AGENTS) {
    try {
      const document = await fetchFeedDocument(
        feed.url,
        userAgent,
        validators,
        "text/html,application/xhtml+xml",
      );
      if (document.status === "not-modified") return document;
      if (isBotChallenge(document.body)) throw new Error("Feed page is a bot challenge");
      return htmlMeetings(feed, format, document.body, document.etag, document.lastModified);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Feed fetch failed");
    }
  }
  if (format === "ukna") {
    const snapshot = readUknaSnapshot(feed.id);
    if (snapshot) {
      return htmlMeetings(feed, format, snapshot, null, null);
    }
  }
  throw lastError;
}

function htmlMeetings(
  feed: ClaimedFeed,
  format: "aagb-region" | "cauk" | "ukna",
  body: string,
  etag: string | null,
  lastModified: string | null,
): FeedPayload {
  if (format === "aagb-region") {
    return {
      status: "ok",
      meetings: [],
      etag,
      lastModified,
      intergroups: aagbIntergroupHomes(body, feed.url),
    };
  }
  const meetings = format === "cauk" ? parseCaukLocationsHtml(body) : parseUknaHtml(body);
  if (meetings.length === 0) throw new Error("Feed page did not include a meeting list");
  return { status: "ok", meetings, etag, lastModified };
}

function readUknaSnapshot(feedId: string) {
  const path = join(process.cwd(), "src/data/snapshots", `${feedId}.html`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export async function registerDiscoveredIntergroups(
  discovered: { id: string; name: string; url: string }[],
) {
  if (!discovered.length) return;
  const db = getDb();
  const existing = await db.select({ url: feeds.url }).from(feeds);
  const covered = new Set(
    existing
      .map((row) => aagbIntergroupSlug(row.url))
      .filter((slug): slug is string => Boolean(slug)),
  );
  for (const intergroup of discovered) {
    const slug = aagbIntergroupSlug(intergroup.url);
    if (!slug || covered.has(slug)) continue;
    covered.add(slug);
    const url = canonicalFeedUrl(intergroup.url);
    await db
      .insert(feeds)
      .values({
        id: intergroup.id,
        name: intergroup.name,
        url,
        regionHint: "GB",
        fellowship: "aa",
        format: "aagb",
        status: "pending",
      })
      .onConflictDoNothing();
  }
}

export async function fetchJson(
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

export class GeocodeLookup {
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
