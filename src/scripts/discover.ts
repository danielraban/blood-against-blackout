process.loadEnvFile(".env.local");
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import hosts from "../data/discovery-hosts.json";
import seedFeeds from "../data/feeds.json";
import bmltServers from "../data/bmlt-servers.json";
import { getDb } from "../lib/db";
import { canonicalFeedUrl, tsmlCandidateUrls } from "../lib/feed-url";
import {
  AA_NEAR_YOU_URL,
  allocateDiscoverFeedId,
  extractHttpsHosts,
  guessFellowship,
  guessRegion,
} from "../lib/discover-hosts";
import { bmltInfoUrl, bmltSearchUrl } from "../lib/parse-feed";
import { feeds } from "../lib/schema";
import { slugify } from "../lib/utils";

type CatalogFeed = {
  id: string;
  name: string;
  url: string;
  regionHint: string;
  fellowship?: string;
  format?: string;
};

type DiscoverCandidate = {
  url: string;
  fellowship: string;
  format: string;
  id: string;
  name: string;
  regionHint: string;
  infoUrl?: string;
};

const DISCOVERY_UA = "blood-against-blackout/1.0 (feed discovery)";

async function looksLikeFeed(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": DISCOVERY_UA,
      },
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) return { ok: false as const, count: 0, format: "tsml" as const };
    const data = await response.json();
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { results?: unknown }).results)
        ? (data as { results: unknown[] }).results
        : Array.isArray((data as { meetings?: unknown }).meetings)
          ? (data as { meetings: unknown[] }).meetings
          : null;
    const ok = Array.isArray(list) && list.length > 0 && typeof list[0] === "object";
    const first = ok ? (list[0] as Record<string, unknown>) : null;
    const format =
      first && (first.meeting_name || first.weekday_tinyint || first.id_bigint)
        ? ("bmlt" as const)
        : first && first.groupID && first.timeUTC
          ? ("oiaa" as const)
          : ("tsml" as const);
    return { ok, count: ok ? list.length : 0, format };
  } catch {
    return { ok: false as const, count: 0, format: "tsml" as const };
  }
}

async function feedFromHomepage(host: string) {
  try {
    const response = await fetch(`https://${host}/`, {
      headers: { "User-Agent": DISCOVERY_UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(
      /<link[^>]+title=["']Meetings Feed["'][^>]*href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*title=["']Meetings Feed["']/i,
    );
    const href = match?.[1] || match?.[2];
    if (!href) return null;
    return href.startsWith("http") ? href : new URL(href, `https://${host}/`).toString();
  } catch {
    return null;
  }
}

async function hostsFromAaNearYou() {
  try {
    const response = await fetch(AA_NEAR_YOU_URL, {
      headers: { "User-Agent": DISCOVERY_UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    return extractHttpsHosts(await response.text());
  } catch {
    return [];
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

async function main() {
  const db = getDb();
  const existingRows = await db.select({ id: feeds.id, url: feeds.url }).from(feeds);
  const existing = new Set(existingRows.map((row) => canonicalFeedUrl(row.url)));
  const existingIds = new Set(existingRows.map((row) => row.id));
  const nearYouHosts = await hostsFromAaNearYou();
  const allHosts = [...new Set([...hosts, ...nearYouHosts])];
  const hostPath = join(process.cwd(), "src/data/discovery-hosts.json");
  if (nearYouHosts.length) {
    writeFileSync(hostPath, `${JSON.stringify(allHosts, null, 2)}\n`);
  }

  const hostCandidates: DiscoverCandidate[] = allHosts.flatMap((host) =>
    tsmlCandidateUrls(host).map((url) => ({
      url,
      fellowship: guessFellowship(host),
      format: "tsml" as const,
      id: slugify(host.replace(/^www\./, "")),
      name: host.replace(/^www\./, ""),
      regionHint: guessRegion(host),
    })),
  );
  const seedCandidates: DiscoverCandidate[] = (seedFeeds as CatalogFeed[]).map((feed) => ({
    url: feed.url,
    fellowship: feed.fellowship || "aa",
    format: feed.format || "tsml",
    id: feed.id,
    name: feed.name,
    regionHint: feed.regionHint,
  }));
  const bmltCandidates: DiscoverCandidate[] = (
    bmltServers as { id: string; name: string; url: string; regionHint: string }[]
  ).map((server) => ({
    url: bmltSearchUrl(server.url),
    fellowship: "na",
    format: "bmlt" as const,
    id: server.id,
    name: server.name,
    regionHint: server.regionHint,
    infoUrl: bmltInfoUrl(server.url),
  }));

  const seenCandidates = new Set<string>();
  const candidates: DiscoverCandidate[] = [...seedCandidates, ...bmltCandidates, ...hostCandidates].filter((candidate) => {
    const key = canonicalFeedUrl(candidate.url);
    if (seenCandidates.has(key)) return false;
    seenCandidates.add(key);
    return true;
  });

  const found: CatalogFeed[] = [...(seedFeeds as CatalogFeed[])];
  const foundUrls = new Set(found.map((feed) => canonicalFeedUrl(feed.url)));
  let added = 0;
  let live = 0;

  await mapPool(candidates, 8, async (candidate) => {
    process.stdout.write(`checking ${candidate.url}\n`);
    if (candidate.infoUrl) {
      const info = await looksLikeFeed(candidate.infoUrl);
      if (!info.ok) return;
    }
    let result = await looksLikeFeed(candidate.url);
    let resolved = candidate.url;
    if (!result.ok) {
      try {
        const host = new URL(candidate.url).hostname;
        const linked = await feedFromHomepage(host);
        if (linked && linked !== candidate.url) {
          process.stdout.write(`  homepage feed ${linked}\n`);
          result = await looksLikeFeed(linked);
          if (result.ok) resolved = linked;
        }
      } catch {
        /* ignore */
      }
    }
    if (!result.ok) return;
    live += 1;
    process.stdout.write(`  ok ${result.count} meetings (${result.format})\n`);
    const canonical = canonicalFeedUrl(resolved);
    if (existing.has(canonical) || foundUrls.has(canonical)) return;
    const host = new URL(canonical).hostname.replace(/^www\./, "");
    const id = allocateDiscoverFeedId({
      candidateId: candidate.id,
      candidateUrl: candidate.url,
      resolvedUrl: canonical,
      existingIds: [...existingIds, ...found.map((feed) => feed.id)],
    });
    const row: CatalogFeed = {
      id,
      name: candidate.name || host,
      url: canonical,
      regionHint: candidate.regionHint,
      fellowship: candidate.fellowship,
      format: result.format || candidate.format,
    };
    found.push(row);
    foundUrls.add(canonical);
    existingIds.add(id);
    try {
      await db
        .insert(feeds)
        .values({
          id: row.id,
          name: row.name,
          url: row.url,
          regionHint: row.regionHint,
          fellowship: guessFellowship(host, row.fellowship),
          format: result.format,
          status: "pending",
        })
        .onConflictDoNothing();
      added += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "insert failed";
      process.stdout.write(`  skip insert ${row.id}: ${message}\n`);
    }
  });

  const catalogPath = join(process.cwd(), "src/data/feeds.discovered.json");
  writeFileSync(catalogPath, `${JSON.stringify(found, null, 2)}\n`);
  console.log(
    `Discovery live=${live} added=${added}. Catalog ${found.length} URLs written to src/data/feeds.discovered.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
