import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fallbackFeedUrls, isProbablyJson } from "../lib/feed-url";
import { asMeetingArray, bmltSearchUrl } from "../lib/parse-feed";

const FAILED_IDS = [
  "aasfmarin",
  "aasantacruz",
  "www-aa-london-com",
  "atlantaaa",
  "aapdx",
  "austinaa",
  "aasanjose",
  "eastbayaa",
  "lacoaa",
  "aaboston",
  "chicagoaa",
  "aadallas",
  "miami-aa",
  "tampa-aa",
  "aabaltimore",
  "aaphiladelphia",
  "minneapolis",
  "detroit",
  "na-wisconsin",
  "tucson",
  "sacramento",
  "honolulu",
  "london-uk",
  "glasgow-uk",
  "dublin",
  "sydney",
  "cer-europe",
  "aa-southmidlands",
  "westkent-uk",
  "nm-aa",
  "ncintergroup",
  "memphis-aa-org",
  "www-aa-org-nz",
  "www-memphis-aa-org",
  "aa-london-com",
  "orlandoaa",
  "vancouver",
  "manchester-uk",
  "auckland",
  "contracosta",
  "ca-losangeles",
  "na-philadelphia",
  "na-indiana",
];

const DUPLICATES = new Set([
  "www-aa-london-com",
  "aa-london-com",
  "www-aa-org-nz",
  "www-memphis-aa-org",
]);

const seedFeeds = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/feeds.json"), "utf8"),
) as { id: string; url: string }[];
const bmltServers = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/bmlt-servers.json"), "utf8"),
) as { id: string; url: string }[];

const byId = new Map<string, { id: string; url: string; bmlt?: boolean }>();
for (const feed of seedFeeds) byId.set(feed.id, feed);
for (const server of bmltServers) {
  byId.set(server.id, { ...server, bmlt: true });
}

async function probeUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "blood-against-blackout/1.0 (meeting finder)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    const json = isProbablyJson(response.headers.get("content-type"), body);
    let count = 0;
    if (json) {
      try {
        count = asMeetingArray(JSON.parse(body)).length;
      } catch {
        return { url, ok: false, status: response.status, error: "JSON shape" };
      }
    }
    if (!response.ok) {
      return { url, ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    if (!json) {
      return { url, ok: false, status: response.status, error: "not JSON" };
    }
    return { url, ok: count > 0, status: response.status, count };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

async function probeFeed(id: string) {
  if (DUPLICATES.has(id)) {
    return { id, outcome: "duplicate", workingUrl: null };
  }
  const feed = byId.get(id);
  if (!feed) {
    return { id, outcome: "missing", workingUrl: null };
  }
  const candidates = feed.bmlt
    ? [bmltSearchUrl(feed.url)]
    : [feed.url, ...fallbackFeedUrls(feed.url)];
  const attempts = [];
  for (const candidate of candidates) {
    const result = await probeUrl(candidate);
    attempts.push(result);
    if (result.ok) {
      return { id, outcome: "ok", workingUrl: result.url, count: result.count, attempts };
    }
  }
  return { id, outcome: "disable", workingUrl: null, attempts };
}

async function main() {
  const results = [];
  for (let i = 0; i < FAILED_IDS.length; i += 4) {
    const batch = FAILED_IDS.slice(i, i + 4);
    const batchResults = await Promise.all(batch.map((id) => probeFeed(id)));
    for (const result of batchResults) {
      results.push(result);
      const summary =
        result.outcome === "ok"
          ? `ok ${result.count} ${result.workingUrl}`
          : result.outcome;
      console.log(`${result.id}: ${summary}`);
    }
  }
  console.log("---");
  console.log(
    JSON.stringify(
      results.map((result) => ({
        id: result.id,
        outcome: result.outcome,
        workingUrl: result.workingUrl,
        count: result.count,
        error: result.attempts?.find((attempt) => !attempt.ok)?.error,
      })),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
