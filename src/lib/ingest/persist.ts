import { and, eq, inArray, not, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db";
import { entities, feeds, ingestCatalog, meetings } from "../schema";
import { encodeGeohash4 } from "../geo";
import { slugify } from "../utils";
import { asFellowship, asFeedFormat } from "../fellowship";
import { bmltSearchUrl, dedupeMeetingsBySlug, parseFeedMeetings } from "../parse-feed";
import {
  canonicalFeedUrl,
  DUPLICATE_FEED_IDS,
  feedIdsToReplaceForCatalog,
} from "../feed-url";
import { applyRegionHint, isUsableCityLabel, locationNeedsEnrichment, normalizePlaceFields } from "../location";
import { hashFeedCatalog, INGEST_CATALOG_ID } from "../ingest-catalog";
import {
  borrowVenueCoordinates,
  POSTCODE_GEOCODE_LIMIT,
  postcodeGeocodeQuery,
  uniqueGeocodeQueries,
} from "../geocode-batch";
import { FEED_LEASE_SECONDS, type ClaimedFeed } from "../ingest-lease";
import type { IngestStatTotals } from "../ingest-queue";
import { enrichPlace, type PlaceEnrichmentBudget } from "../canonicalize-place";
import {
  fetchJson,
  GeocodeLookup,
  readAagbHtml,
  readIndexedHtml,
  registerDiscoveredIntergroups,
} from "./fetch";

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


export async function ingestFeed(
  feed: ClaimedFeed,
  enrichmentBudget: PlaceEnrichmentBudget,
  stats: IngestStatTotals,
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
    const validators = {
      etag: feed.etag,
      lastModified: feed.lastModified,
    };
    const payload =
      format === "aagb"
        ? await readAagbHtml(feed.url, validators, {
            entityName: feed.name,
            entityUrl: feed.url,
          })
        : format === "aagb-region" || format === "cauk" || format === "ukna"
          ? await readIndexedHtml(feed, format, validators)
          : await fetchJson(feed.url, validators, format !== "oiaa");
    if (payload.status === "ok" && payload.intergroups?.length) {
      await registerDiscoveredIntergroups(payload.intergroups);
    }
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
    const geocodeAllPostcodes = format === "aagb" || format === "ukna";
    let geocodeBudget = 3;
    let postcodeBudget = geocodeAllPostcodes
      ? Math.max(
          POSTCODE_GEOCODE_LIMIT,
          new Set(
            placed.flatMap((item) => {
              const query = postcodeGeocodeQuery(item);
              return query && item.lat == null && item.attendance !== "online" ? [query] : [];
            }),
          ).size,
        )
      : POSTCODE_GEOCODE_LIMIT;
    let missedPostcodePins = 0;
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
        } else if (known === undefined) {
          missedPostcodePins += 1;
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
    if (missedPostcodePins > 0) {
      throw new Error(`Feed left ${missedPostcodePins} meetings without coordinates`);
    }
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
    const keptSlugs = uniqueMeetingRows.map((row) => row.slug);
    operations.push(
      keptSlugs.length === 0
        ? db.delete(meetings).where(eq(meetings.feedId, feed.id))
        : db
            .delete(meetings)
            .where(
              and(
                eq(meetings.feedId, feed.id),
                not(inArray(meetings.slug, keptSlugs)),
              ),
            ),
    );
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
