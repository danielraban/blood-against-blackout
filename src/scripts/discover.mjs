process.loadEnvFile(".env.local");

import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const seedFeeds = JSON.parse(readFileSync(new URL("../data/feeds.json", import.meta.url), "utf8"));
const hosts = JSON.parse(readFileSync(new URL("../data/discovery-hosts.json", import.meta.url), "utf8"));
const bmltServers = JSON.parse(
  readFileSync(new URL("../data/bmlt-servers.json", import.meta.url), "utf8"),
);

function tsmlUrls(host) {
  return [
    `https://${host}/wp-admin/admin-ajax.php?action=meetings`,
    `https://${host}/?tsml-feed=1`,
    `https://${host}/?post_type=tsml_meeting&feed=tsml`,
    `https://${host}/meetings.json`,
    `https://${host}/wp-json/tsml/v1/meetings`,
    `https://${host}/api/meetingguide.json`,
    `https://${host}/api/meetingguide/`,
  ];
}

function bmltSearchUrl(root) {
  const base = root.endsWith("/") ? root : `${root}/`;
  return `${base}client_interface/json/?switcher=GetSearchResults`;
}

function bmltInfoUrl(root) {
  const base = root.endsWith("/") ? root : `${root}/`;
  return `${base}client_interface/json/?switcher=GetServerInfo`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function guessRegion(host) {
  if (host.endsWith(".uk") || host.includes("london") || host.includes("glasgow")) return "GB";
  if (host.endsWith(".ie")) return "IE";
  if (host.endsWith(".eu")) return "EU";
  if (host.endsWith(".au")) return "AU";
  if (host.endsWith(".nz")) return "NZ";
  if (host.endsWith(".za")) return "ZA";
  if (
    /toronto|vancouver|calgary|ottawa|montreal|edmonton|winnipeg|victoriaaa/.test(host)
  ) {
    return "CA";
  }
  return "US";
}

function guessFellowship(host, hinted) {
  if (hinted) return hinted;
  if (/\bna[-.]|narcotics|bmlt/.test(host)) return "na";
  if (/\bca[-.]|cocaineanonymous|ca4la|cauk/.test(host)) return "ca";
  return "aa";
}

async function looksLikeFeed(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "blood-against-blackout/1.0 (feed discovery)",
      },
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) return { ok: false, count: 0, format: "tsml" };
    const data = await response.json();
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.meetings)
          ? data.meetings
          : null;
    const ok = Array.isArray(list) && list.length > 0 && typeof list[0] === "object";
    const format =
      ok && (list[0].meeting_name || list[0].weekday_tinyint || list[0].id_bigint)
        ? "bmlt"
        : "tsml";
    return { ok, count: ok ? list.length : 0, format };
  } catch {
    return { ok: false, count: 0, format: "tsml" };
  }
}

async function mapPool(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

const existingRows = await sql`select url from feeds`;
const existing = new Set(existingRows.map((row) => row.url));
const hostCandidates = [];
const seenHostUrls = new Set();
for (const host of hosts) {
  for (const url of tsmlUrls(host)) {
    if (seenHostUrls.has(url)) continue;
    seenHostUrls.add(url);
    hostCandidates.push({
      url,
      fellowship: guessFellowship(host),
      format: "tsml",
      id: slugify(host),
      name: host.replace(/^www\./, ""),
      regionHint: guessRegion(host),
    });
  }
}

const seedCandidates = seedFeeds.map((feed) => ({
  url: feed.url,
  fellowship: feed.fellowship || "aa",
  format: feed.format || "tsml",
  id: feed.id,
  name: feed.name,
  regionHint: feed.regionHint,
}));

const bmltCandidates = bmltServers.map((server) => ({
  url: bmltSearchUrl(server.url),
  fellowship: "na",
  format: "bmlt",
  id: server.id,
  name: server.name,
  regionHint: server.regionHint,
  infoUrl: bmltInfoUrl(server.url),
}));

const candidates = [...seedCandidates, ...bmltCandidates, ...hostCandidates];
const found = [...seedFeeds];
const foundUrls = new Set(found.map((f) => f.url));
let added = 0;
let live = 0;

await mapPool(candidates, 8, async (candidate) => {
  process.stdout.write(`checking ${candidate.url}\n`);
  if (candidate.infoUrl) {
    const info = await looksLikeFeed(candidate.infoUrl);
    if (!info.ok) return;
  }
  const result = await looksLikeFeed(candidate.url);
  if (!result.ok) return;
  live += 1;
  process.stdout.write(`  ok ${result.count} meetings (${result.format})\n`);
  if (existing.has(candidate.url) || foundUrls.has(candidate.url)) return;
  const row = {
    id: candidate.id,
    name: candidate.name,
    url: candidate.url,
    regionHint: candidate.regionHint,
    fellowship: candidate.fellowship,
    format: result.format || candidate.format,
  };
  found.push(row);
  foundUrls.add(candidate.url);
  await sql`
    insert into feeds (id, name, url, region_hint, fellowship, format, status)
    values (${row.id}, ${row.name}, ${row.url}, ${row.regionHint}, ${row.fellowship}, ${row.format}, 'pending')
    on conflict (id) do nothing
  `;
  added += 1;
});

for (const feed of seedFeeds) {
  await sql`
    insert into feeds (id, name, url, region_hint, fellowship, format, status)
    values (
      ${feed.id},
      ${feed.name},
      ${feed.url},
      ${feed.regionHint},
      ${feed.fellowship || "aa"},
      ${feed.format || "tsml"},
      'pending'
    )
    on conflict (id) do update set
      name = excluded.name,
      url = excluded.url,
      region_hint = excluded.region_hint,
      fellowship = excluded.fellowship,
      format = excluded.format
  `;
}

writeFileSync(
  new URL("../data/feeds.discovered.json", import.meta.url),
  `${JSON.stringify(found, null, 2)}\n`,
);
console.log(`live=${live} added=${added} catalog=${found.length}`);
