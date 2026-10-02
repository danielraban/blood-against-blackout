import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getDb } from "../db";
import { feeds, ingestCatalog, ingestRuns } from "../schema";
import { slugify } from "../utils";
import { asFellowship, asFeedFormat } from "../fellowship";
import { canonicalFeedUrl } from "../feed-url";
import { SOURCE_FRESHNESS_HOURS } from "../verification";
import {
  cityRebuildPlan,
  meetingGeohashesForFeeds,
  rebuildCities,
  rebuildCitiesForFeeds,
} from "../ingest-cities";
import { invalidateSliceCaches } from "../slices";
import { CITIES_CLEAN, CITIES_DIRTY, INGEST_CITIES_ID } from "../ingest-catalog";
import { feedClaimSql } from "../ingest-claim";
import {
  mapClaimedFeedRow,
  resultRows,
  type ClaimedFeed,
} from "../ingest-lease";
import { clonePlaceBudget, mergeIngestStats, runWithConcurrency } from "../ingest-queue";
import { canUseAiCanonicalization, type PlaceEnrichmentBudget } from "../canonicalize-place";
import { GeocodeLookup } from "./fetch";
import { ingestFeed, seedFeedCatalog } from "./persist";

export const DEFAULT_INGEST_LIMIT = 20;
export const MAX_INGEST_LIMIT = 32;
export const INGEST_TIME_BUDGET_MS = 240_000;
export const INGEST_CONCURRENCY = 4;

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
  const writtenFeedIds = new Set<string>();
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
        async (feed) => {
          const localStats = emptyStats();
          await ingestFeed(
            feed,
            clonePlaceBudget(enrichmentBudget),
            localStats,
            geocodes,
          );
          mergeIngestStats(stats, localStats);
          if (localStats.feedsWritten > 0) writtenFeedIds.add(feed.id);
        },
        () => Date.now() < deadline,
      );
      if (leftover.length > 0) {
        stats.budgetExhausted += leftover.length;
        await releaseLeases(leftover.map((feed) => feed.id));
      }
      if (options.once || stats.budgetExhausted > 0) break;
    }
    const dirty = await citiesAreDirty();
    const plan = cityRebuildPlan(dirty, [...writtenFeedIds]);
    if (plan.mode === "full") {
      await rebuildCities();
      await markCitiesClean();
    } else if (plan.mode === "incremental") {
      await rebuildCitiesForFeeds(plan.feedIds);
    }
    if (writtenFeedIds.size > 0) {
      const hashes = await meetingGeohashesForFeeds([...writtenFeedIds]);
      await invalidateSliceCaches(hashes);
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
