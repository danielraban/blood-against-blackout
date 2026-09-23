import { slugify } from "./utils";
import { canonicalFeedUrl } from "./feed-url";

export const AA_NEAR_YOU_URL = "https://www.aa.org/aa-near-you";

const SKIP_HOSTS = new Set([
  "www.aa.org",
  "aa.org",
  "www.na.org",
  "na.org",
  "ca.org",
  "www.ca.org",
]);

export function extractHttpsHosts(html: string) {
  const hosts = new Set<string>();
  const pattern = /https?:\/\/((?:www\.)?[a-z0-9.-]+\.[a-z]{2,})/gi;
  for (const match of html.matchAll(pattern)) {
    const host = match[1].toLowerCase();
    if (SKIP_HOSTS.has(host)) continue;
    if (host.endsWith(".aa.org") || host.includes("googleapis") || host.includes("gstatic")) {
      continue;
    }
    hosts.add(host);
  }
  return [...hosts];
}

export function guessRegion(host: string): string {
  if (host.endsWith(".uk") || host.includes("london") || host.includes("glasgow") || host.includes("edinburgh"))
    return "GB";
  if (host.endsWith(".ie")) return "IE";
  if (host.endsWith(".eu")) return "EU";
  if (host.endsWith(".au")) return "AU";
  if (host.endsWith(".nz")) return "NZ";
  if (host.endsWith(".za")) return "ZA";
  if (
    host.includes("toronto") ||
    host.includes("vancouver") ||
    host.includes("calgary") ||
    host.includes("ottawa") ||
    host.includes("montreal") ||
    host.includes("edmonton") ||
    host.includes("winnipeg") ||
    host.includes("victoriaaa")
  )
    return "CA";
  return "US";
}

export function guessFellowship(host: string, hinted?: string | null) {
  if (hinted === "na" || hinted === "ca" || hinted === "aa") return hinted;
  if (/\bna[-.]|narcotics|bmlt/.test(host)) return "na";
  if (/\bca[-.]|cocaineanonymous|ca4la|cauk|georgiaca/.test(host)) return "ca";
  return "aa";
}

export function allocateDiscoverFeedId(options: {
  candidateId: string;
  candidateUrl: string;
  resolvedUrl: string;
  existingIds: Iterable<string>;
}) {
  const taken = new Set(options.existingIds);
  const resolvedHost = new URL(options.resolvedUrl).hostname.replace(/^www\./i, "");
  const preferred =
    canonicalFeedUrl(options.candidateUrl) === canonicalFeedUrl(options.resolvedUrl)
      ? options.candidateId
      : slugify(resolvedHost);
  if (preferred && !taken.has(preferred)) return preferred;
  if (!taken.has(slugify(resolvedHost))) return slugify(resolvedHost);
  let suffix = 2;
  while (taken.has(`${slugify(resolvedHost)}-${suffix}`)) suffix += 1;
  return `${slugify(resolvedHost)}-${suffix}`;
}
