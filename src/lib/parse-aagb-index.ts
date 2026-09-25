const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MEETING_LIST =
  /\/(?:in-person-meetings|physical-meetings|meetings)\/?$/i;

export type AagbIntergroupLink = {
  id: string;
  name: string;
  url: string;
};

export function aagbIntergroupHomes(html: string, pageUrl: string): AagbIntergroupLink[] {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  const homes = new Map<string, AagbIntergroupLink>();
  const headings = [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading || heading.index == null) continue;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const slice = html.slice(start, end);
    const headingName = textOf(heading[1] ?? "");
    for (const link of slice.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const home = intergroupHome(link[1] ?? "", page);
      if (!home) continue;
      const current = homes.get(home.slug);
      const name = usableName(headingName) ?? titleFromSlug(home.slug);
      if (!current || current.name === titleFromSlug(home.slug)) {
        homes.set(home.slug, {
          id: `aa-${home.slug}`.slice(0, 80),
          name,
          url: home.url,
        });
      }
    }
  }
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const home = intergroupHome(link[1] ?? "", page);
    if (!home || homes.has(home.slug)) continue;
    const label = textOf(link[2] ?? "");
    homes.set(home.slug, {
      id: `aa-${home.slug}`.slice(0, 80),
      name: usableName(label) ?? titleFromSlug(home.slug),
      url: home.url,
    });
  }
  return [...homes.values()];
}

export function aagbMeetingListLinks(html: string, pageUrl: string) {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  const intergroup = page.pathname.match(/^\/intergroups\/([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  if (!intergroup) return [];
  const prefix = `/intergroups/${intergroup}/`;
  const links = new Set<string>();
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    let url: URL;
    try {
      url = new URL(link[1] ?? "", page);
    } catch {
      continue;
    }
    if (url.hostname !== page.hostname) continue;
    const path = url.pathname.toLowerCase();
    if (!path.startsWith(prefix) || path === prefix) continue;
    if (/online-meetings|intergroup-meetings|service|vacanc|convention/.test(path)) continue;
    if (!MEETING_LIST.test(path)) continue;
    url.hash = "";
    url.search = "";
    links.add(url.toString());
  }
  return [...links];
}

export function aagbIntergroupSlug(url: string) {
  try {
    return new URL(url).pathname.match(/^\/intergroups\/([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function isBotChallenge(html: string) {
  return /just a moment|cf-browser-verification|challenge-platform|performing security verification/i.test(
    html,
  );
}

function intergroupHome(href: string, page: URL) {
  let url: URL;
  try {
    url = new URL(href, page);
  } catch {
    return null;
  }
  if (url.hostname !== page.hostname) return null;
  const slug = url.pathname.match(/^\/intergroups\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase();
  if (!slug) return null;
  return { slug, url: `${url.origin}/intergroups/${slug}/` };
}

function usableName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || /find out more/i.test(name)) return null;
  if (WEEKDAYS.includes(name.toLowerCase())) return null;
  return name;
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function textOf(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
