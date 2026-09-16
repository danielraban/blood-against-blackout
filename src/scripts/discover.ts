process.loadEnvFile(".env.local");
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import hosts from "../data/discovery-hosts.json";
import seedFeeds from "../data/feeds.json";
import { getDb } from "../lib/db";
import { canonicalFeedUrl } from "../lib/feed-url";
import { feeds } from "../lib/schema";
import { slugify } from "../lib/utils";

type SeedFeed = { id: string; name: string; url: string; regionHint: string };

function tsmlUrl(host: string) {
  return `https://${host}/wp-admin/admin-ajax.php?action=meetings`;
}

function guessRegion(host: string): string {
  if (host.endsWith(".uk") || host.includes("london") || host.includes("glasgow") || host.includes("edinburgh"))
    return "GB";
  if (host.endsWith(".ie")) return "IE";
  if (host.endsWith(".eu")) return "EU";
  if (host.endsWith(".au")) return "AU";
  if (host.endsWith(".nz")) return "NZ";
  if (host.endsWith(".za")) return "ZA";
  if (host.includes("toronto") || host.includes("vancouver") || host.includes("calgary") || host.includes("ottawa") || host.includes("montreal") || host.includes("edmonton") || host.includes("winnipeg") || host.includes("victoriaaa"))
    return "CA";
  return "US";
}

async function looksLikeFeed(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "blood-against-blackout/1.0 (feed discovery)",
      },
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) return { ok: false as const, count: 0 };
    const data = await response.json();
    const ok = Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === "object";
    return { ok, count: ok ? data.length : 0 };
  } catch {
    return { ok: false as const, count: 0 };
  }
}

async function feedFromHomepage(host: string) {
  try {
    const response = await fetch(`https://${host}/`, {
      headers: { "User-Agent": "blood-against-blackout/1.0 (feed discovery)" },
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

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  const db = getDb();
  const existing = new Set(
    (await db.select({ url: feeds.url }).from(feeds)).map((f) =>
      canonicalFeedUrl(f.url),
    ),
  );
  const candidates = [
    ...seedFeeds.map((f) => f.url),
    ...hosts.map(tsmlUrl),
  ].map(canonicalFeedUrl);
  const unique = [...new Set(candidates)];
  const found: SeedFeed[] = [...seedFeeds];
  const foundUrls = new Set(found.map((f) => canonicalFeedUrl(f.url)));
  let added = 0;

  await mapPool(unique, 8, async (url) => {
    process.stdout.write(`checking ${url}\n`);
    let result = await looksLikeFeed(url);
    let resolved = url;
    if (!result.ok) {
      try {
        const host = new URL(url).hostname;
        const linked = await feedFromHomepage(host);
        if (linked && linked !== url) {
          process.stdout.write(`  homepage feed ${linked}\n`);
          result = await looksLikeFeed(linked);
          if (result.ok) resolved = linked;
        }
      } catch {
        /* ignore */
      }
    }
    if (!result.ok) return;
    process.stdout.write(`  ok ${result.count} meetings\n`);
    const canonical = canonicalFeedUrl(resolved);
    if (existing.has(canonical) || foundUrls.has(canonical)) return;
    const host = new URL(canonical).hostname.replace(/^www\./, "");
    const row: SeedFeed = {
      id: slugify(host),
      name: host,
      url: canonical,
      regionHint: guessRegion(host),
    };
    found.push(row);
    foundUrls.add(canonical);
    await db
      .insert(feeds)
      .values({
        id: row.id,
        name: row.name,
        url: row.url,
        regionHint: row.regionHint,
        status: "pending",
      })
      .onConflictDoNothing();
    added += 1;
  });

  const catalogPath = join(process.cwd(), "src/data/feeds.discovered.json");
  writeFileSync(catalogPath, `${JSON.stringify(found, null, 2)}\n`);
  console.log(`Discovery added ${added} feeds. Catalog ${found.length} URLs written to src/data/feeds.discovered.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
