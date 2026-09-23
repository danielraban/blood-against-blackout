export function canonicalFeedUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  url.hash = "";
  if (
    url.pathname.endsWith("/") &&
    url.pathname !== "/" &&
    !url.pathname.includes("/client_interface/")
  ) {
    url.pathname = url.pathname.slice(0, -1);
  }
  if (
    url.pathname.endsWith("/wp-admin/admin-ajax.php") &&
    url.searchParams.get("action") === "meetings"
  ) {
    url.search = "?action=meetings";
  }
  if (
    url.pathname.includes("/client_interface/json") &&
    url.searchParams.get("switcher") === "GetSearchResults"
  ) {
    const keep = new URLSearchParams();
    keep.set("switcher", "GetSearchResults");
    for (const key of ["lat_val", "long_val", "geo_width_km", "venue_types"]) {
      const value = url.searchParams.get(key);
      if (value) keep.set(key, value);
    }
    url.search = `?${keep.toString()}`;
  }
  return url.toString();
}

export function isProbablyJson(contentType: string | null, body: string) {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  const type = contentType?.toLowerCase() ?? "";
  return type.includes("json") && !type.includes("html");
}

export function fallbackFeedUrls(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  if (url.pathname.includes("/client_interface/")) {
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    const search = url.search || "?switcher=GetSearchResults";
    const current = canonicalFeedUrl(raw);
    return [
      canonicalFeedUrl(`${url.origin}${path}index.php${search}`),
    ].filter((candidate) => candidate !== current);
  }
  if (/bmlt|main_server/i.test(`${url.hostname}${url.pathname}`)) {
    const root = `${url.origin}${url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`}`;
    return [canonicalFeedUrl(`${root}client_interface/json/?switcher=GetSearchResults`)];
  }
  const current = canonicalFeedUrl(raw);
  return [
    ...new Set(
      tsmlCandidateUrls(url.hostname)
        .map(canonicalFeedUrl)
        .filter((candidate) => candidate !== current),
    ),
  ];
}

export function tsmlCandidateUrls(host: string) {
  const hostname = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const origin = `https://${hostname}`;
  return [
    `${origin}/wp-admin/admin-ajax.php?action=meetings`,
    `${origin}/?tsml-feed=1`,
    `${origin}/?post_type=tsml_meeting&feed=tsml`,
    `${origin}/wp-json/tsml/v1/meetings`,
    `${origin}/api/meetingguide`,
    `${origin}/api/meetingguide/`,
    `${origin}/api/meetingguide.json`,
    `${origin}/meetings.json`,
  ];
}

export function feedIdsToReplaceForCatalog(
  catalog: { id: string; url: string }[],
  existing: { id: string; url: string }[],
) {
  const catalogIdByUrl = new Map<string, string>();
  for (const row of catalog) {
    const url = canonicalFeedUrl(row.url);
    if (!catalogIdByUrl.has(url)) catalogIdByUrl.set(url, row.id);
  }
  const replace = new Set<string>();
  for (const row of existing) {
    const catalogId = catalogIdByUrl.get(canonicalFeedUrl(row.url));
    if (catalogId && catalogId !== row.id) replace.add(row.id);
  }
  return [...replace];
}

export const DUPLICATE_FEED_IDS = [
  "www-aa-london-com",
  "aa-london-com",
  "www-aa-org-nz",
  "www-memphis-aa-org",
  "www-oc-aa-org",
  "www-aamonterey-org",
  "www-ct-aa-org",
  "www-area74-org",
  "www-aavirginia-org",
  "www-area78-org",
] as const;
