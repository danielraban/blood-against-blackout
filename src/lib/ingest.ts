import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "./db";
import { cities, entities, feeds, geocodeCache, ingestRuns, meetings } from "./schema";
import { encodeGeohash4 } from "./geo";
import { slugify } from "./utils";
import { asFellowship, asFeedFormat } from "./fellowship";
import {
  asMeetingArray,
  bmltSearchUrl,
  parseFeedMeetings,
  parseTsmlMeeting,
  type RawMeeting,
} from "./parse-feed";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertPublicHttpsUrl } from "./url-security";

const seedFeeds = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/feeds.json"), "utf8"),
) as {
  id: string;
  name: string;
  url: string;
  regionHint: string;
  fellowship?: string;
  format?: string;
}[];

const bmltServers = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/bmlt-servers.json"), "utf8"),
) as { id: string; name: string; url: string; regionHint: string }[];

export function parseRawMeeting(raw: RawMeeting, feedId: string) {
  return parseTsmlMeeting(raw, feedId, "aa");
}

async function fetchJson(url: string) {
  let current = await assertPublicHttpsUrl(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: "application/json",
        "User-Agent": "blood-against-blackout/1.0 (meeting finder)",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Unsafe or excessive feed redirects");
      current = await assertPublicHttpsUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return asMeetingArray(data);
  }
  throw new Error("Feed redirect failed");
}

async function geocodeAddress(query: string) {
  const db = getDb();
  const cached = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.query, query))
    .limit(1);
  if (cached[0]) return { lat: cached[0].lat, lng: cached[0].lng };

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
  await db
    .insert(geocodeCache)
    .values({ query, lat, lng, cachedAt: new Date() })
    .onConflictDoNothing();
  await new Promise((r) => setTimeout(r, 1100));
  return { lat, lng };
}

export async function seedFeedCatalog() {
  const db = getDb();
  for (const feed of seedFeeds) {
    await db
      .insert(feeds)
      .values({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        regionHint: feed.regionHint,
        fellowship: asFellowship(feed.fellowship),
        format: asFeedFormat(feed.format),
        status: "pending",
      })
      .onConflictDoUpdate({
        target: feeds.id,
        set: {
          name: feed.name,
          url: feed.url,
          regionHint: feed.regionHint,
          fellowship: asFellowship(feed.fellowship),
          format: asFeedFormat(feed.format),
        },
      });
  }
  for (const server of bmltServers) {
    await db
      .insert(feeds)
      .values({
        id: server.id,
        name: server.name,
        url: bmltSearchUrl(server.url),
        regionHint: server.regionHint,
        fellowship: "na",
        format: "bmlt",
        status: "pending",
      })
      .onConflictDoUpdate({
        target: feeds.id,
        set: {
          name: server.name,
          url: bmltSearchUrl(server.url),
          regionHint: server.regionHint,
          fellowship: "na",
          format: "bmlt",
        },
      });
  }
}

async function rebuildCities() {
  const db = getDb();
  await db.batch([
    db.delete(cities),
    db.execute(sql`
      with aggregated as (
        select
          trim(both '-' from regexp_replace(lower(coalesce(city, 'unknown')), '[^a-z0-9]+', '-', 'g'))
            || '-' ||
          trim(both '-' from regexp_replace(lower(coalesce(country, 'xx')), '[^a-z0-9]+', '-', 'g')) as slug,
          city as label,
          country,
          coalesce(
            avg(lat) filter (where attendance = 'in-person' and lat is not null),
            avg(lat) filter (where lat is not null)
          )::real as lat,
          coalesce(
            avg(lng) filter (where attendance = 'in-person' and lng is not null),
            avg(lng) filter (where lng is not null)
          )::real as lng,
          coalesce(
            mode() within group (order by geohash4) filter (where attendance = 'in-person' and geohash4 is not null),
            mode() within group (order by geohash4) filter (where geohash4 is not null)
          ) as geohash4,
          count(*)::int as meeting_count
        from meetings
        where city is not null
        group by city, country
        having coalesce(
          avg(lat) filter (where attendance = 'in-person' and lat is not null),
          avg(lat) filter (where lat is not null)
        ) is not null
      ),
      ranked as (
        select *, row_number() over (
          partition by slug order by meeting_count desc, label
        ) as rank
        from aggregated
      )
      insert into cities (slug, label, country, lat, lng, geohash4, meeting_count)
      select slug, label, country, lat, lng, geohash4, meeting_count
      from ranked
      where rank = 1
    `),
  ]);
}

export async function ingestAllFeeds(options: { limit?: number } = {}) {
  const db = getDb();
  await seedFeedCatalog();
  const startedAt = new Date();
  const insertedRuns = await db
    .insert(ingestRuns)
    .values({ startedAt })
    .returning({ id: ingestRuns.id });
  const runId = insertedRuns[0]?.id;

  const enabledFeeds = (await db.select().from(feeds))
    .filter((feed) => feed.status !== "disabled")
    .sort(
      (left, right) =>
        (left.lastAttemptAt?.getTime() ?? 0) - (right.lastAttemptAt?.getTime() ?? 0),
    );
  const allFeeds =
    options.limit && options.limit > 0
      ? enabledFeeds.slice(0, options.limit)
      : enabledFeeds;
  let feedsOk = 0;
  let feedsFail = 0;
  let meetingsUpserted = 0;
  const errors: string[] = [];

  for (const feed of allFeeds) {
    try {
      const fellowship = asFellowship(feed.fellowship);
      const format = asFeedFormat(feed.format);
      const raw = await fetchJson(feed.url);
      const parsed = raw.flatMap((item) =>
        parseFeedMeetings(item, feed.id, fellowship, format),
      );

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

      let geocodeBudget = 3;
      const cityGeo = new Map<string, { lat: number; lng: number }>();
      const meetingRows: (typeof meetings.$inferInsert)[] = [];
      const chunkSize = 80;
      for (const item of parsed) {
          let lat = item.lat;
          let lng = item.lng;
          let geohash4 = item.geohash4;
          if (
            (lat == null || lng == null) &&
            item.attendance !== "online" &&
            item.formattedAddress &&
            geocodeBudget > 0
          ) {
            const geo = await geocodeAddress(item.formattedAddress);
            geocodeBudget -= 1;
            if (geo) {
              lat = geo.lat;
              lng = geo.lng;
              geohash4 = encodeGeohash4(geo.lat, geo.lng);
            }
          }
          if ((lat == null || lng == null) && item.attendance !== "online" && item.city) {
            const cityKey = [item.city, item.state, item.country].filter(Boolean).join(", ");
            let geo = cityGeo.get(cityKey);
            if (!geo && cityGeo.size < 12) {
              const resolved = await geocodeAddress(cityKey);
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
          if (item.attendance !== "online" && (lat == null || lng == null)) {
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
            types: item.types,
            attendance: item.attendance,
            fellowship: item.fellowship,
            locationName: item.locationName,
            address: item.address,
            city: item.city,
            state: item.state,
            postalCode: item.postalCode,
            country: item.country,
            formattedAddress: item.formattedAddress,
            lat,
            lng,
            geohash4,
            conferenceUrl: item.conferenceUrl,
            conferencePhone: item.conferencePhone,
            notes: item.notes,
            locationNotes: item.locationNotes,
            updatedAt: item.updatedAt,
            entityId: item.entityName
              ? `${feed.id}:${slugify(item.entityName)}`
              : null,
          });
      }
      if (parsed.length > 0 && meetingRows.length === 0) {
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
      for (let i = 0; i < meetingRows.length; i += chunkSize) {
        const chunk = meetingRows.slice(i, i + chunkSize);
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
            lastAttemptAt: new Date(),
            lastOkAt: new Date(),
            lastError: null,
            meetingCount: meetingRows.length,
          })
          .where(eq(feeds.id, feed.id)),
      );
      await db.batch(operations as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
      meetingsUpserted += meetingRows.length;
      feedsOk += 1;
    } catch (error) {
      feedsFail += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${feed.id}: ${message}`);
      await db
        .update(feeds)
        .set({
          status: "error",
          lastAttemptAt: new Date(),
          lastError: message.slice(0, 500),
        })
        .where(eq(feeds.id, feed.id));
    }
  }

  await rebuildCities();
  if (runId != null) {
    await db
      .update(ingestRuns)
      .set({
        finishedAt: new Date(),
        feedsOk,
        feedsFail,
        meetingsUpserted,
        errorSummary: errors.slice(0, 20).join("\n") || null,
      })
      .where(eq(ingestRuns.id, runId));
  }

  return {
    feedsProcessed: allFeeds.length,
    feedsOk,
    feedsFail,
    meetingsUpserted,
    errors,
  };
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
  await db
    .insert(feeds)
    .values({
      id: feedId,
      name: name || feedId,
      url,
      fellowship: asFellowship(fellowship),
      format: asFeedFormat(format),
      status: "pending",
    })
    .onConflictDoUpdate({
      target: feeds.id,
      set: {
        name: name || feedId,
        url,
        fellowship: asFellowship(fellowship),
        format: asFeedFormat(format),
        status: "pending",
      },
    });
  return ingestAllFeeds();
}

