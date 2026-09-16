process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import ngeohash from "ngeohash";

const sql = neon(process.env.DATABASE_URL);

function encodeGeohash4(lat, lng) {
  return ngeohash.encode(lat, lng, 4);
}

function asString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 2000) : null;
}

function attendanceOf(raw, types) {
  const conference = asString(raw.conference_url);
  if (types.includes("ONL") && conference) return "hybrid";
  if (types.includes("ONL")) return "online";
  if (conference) return "hybrid";
  return "in-person";
}

const meetings = JSON.parse(
  readFileSync(new URL("../data/sample-sanjose.json", import.meta.url), "utf8"),
);
const feeds = JSON.parse(
  readFileSync(new URL("../data/feeds.json", import.meta.url), "utf8"),
);

for (const feed of feeds) {
  await sql`
    insert into feeds (id, name, url, region_hint, fellowship, format, status)
    values (${feed.id}, ${feed.name}, ${feed.url}, ${feed.regionHint}, ${feed.fellowship || "aa"}, ${feed.format || "tsml"}, 'pending')
    on conflict (id) do update set
      name = excluded.name,
      url = excluded.url,
      region_hint = excluded.region_hint,
      fellowship = excluded.fellowship,
      format = excluded.format
  `;
}

await sql`
  insert into feeds (id, name, url, region_hint, fellowship, format, status, meeting_count, last_ok_at)
  values (
    'code4recovery-sample',
    'San Jose sample feed',
    'https://sheets.code4recovery.org/storage/12Ga8uwMG4WJ8pZ_SEU7vNETp_aQZ-2yNVsYDFqIwHyE.json',
    'US-CA',
    'aa',
    'tsml',
    'ok',
    ${meetings.length},
    now()
  )
  on conflict (id) do update set
    status = 'ok',
    meeting_count = excluded.meeting_count,
    last_ok_at = now()
`;

await sql`delete from meetings where feed_id = 'code4recovery-sample'`;

const rows = [];
for (const raw of meetings) {
  const coords = typeof raw.coordinates === "string" ? raw.coordinates.split(",") : [];
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !raw.name || !raw.slug) continue;
  const types = Array.isArray(raw.types) ? raw.types : [];
  const notes = asString(raw.notes)?.replace(/\s+/g, " ") ?? null;
  rows.push({
    slug: String(raw.slug).slice(0, 64),
    name: String(raw.name).slice(0, 255),
    day: raw.day ?? null,
    time: raw.time ?? null,
    endTime: raw.end_time ?? null,
    types,
    attendance: attendanceOf(raw, types),
    location: asString(raw.location),
    city: asString(raw.region),
    formattedAddress: asString(raw.formatted_address),
    lat,
    lng,
    geohash4: encodeGeohash4(lat, lng),
    conferenceUrl: asString(raw.conference_url),
    notes,
    updated: raw.updated ? new Date(raw.updated) : null,
  });
}

const unique = new Map();
for (const row of rows) unique.set(row.slug, row);
const deduped = [...unique.values()];

const chunkSize = 40;
for (let i = 0; i < deduped.length; i += chunkSize) {
  const chunk = deduped.slice(i, i + chunkSize);
  await sql.transaction(
    chunk.map(
      (row) => sql`
        insert into meetings (
          feed_id, slug, name, group_name, day, time, end_time, timezone, types, attendance, fellowship,
          location_name, address, city, state, postal_code, country, formatted_address,
          lat, lng, geohash4, conference_url, conference_phone, notes, location_notes, updated_at, entity_id
        ) values (
          'code4recovery-sample', ${row.slug}, ${row.name},
          null, ${row.day}, ${row.time}, ${row.endTime}, null, ${row.types},
          ${row.attendance}, 'aa',
          ${row.location}, null, ${row.city}, 'CA', null, 'US', ${row.formattedAddress},
          ${row.lat}, ${row.lng}, ${row.geohash4}, ${row.conferenceUrl}, null, ${row.notes},
          null, ${row.updated}, null
        )
        on conflict (feed_id, slug) do nothing
      `,
    ),
  );
}

await sql`delete from cities`;
await sql`
  insert into cities (slug, label, country, lat, lng, geohash4, meeting_count)
  select
    lower(regexp_replace(coalesce(city, 'unknown'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || coalesce(lower(country), 'xx'),
    city,
    country,
    coalesce(
      avg(lat) filter (where attendance = 'in-person' and lat is not null),
      avg(lat) filter (where lat is not null)
    )::real,
    coalesce(
      avg(lng) filter (where attendance = 'in-person' and lng is not null),
      avg(lng) filter (where lng is not null)
    )::real,
    coalesce(
      mode() within group (order by geohash4) filter (where attendance = 'in-person' and geohash4 is not null),
      mode() within group (order by geohash4) filter (where geohash4 is not null)
    ),
    count(*)::int
  from meetings
  where city is not null
  group by city, country
  having coalesce(
    avg(lat) filter (where attendance = 'in-person' and lat is not null),
    avg(lat) filter (where lat is not null)
  ) is not null
  on conflict (slug) do update set
    meeting_count = excluded.meeting_count,
    lat = excluded.lat,
    lng = excluded.lng,
    geohash4 = excluded.geohash4
`;

console.log(`inserted ${deduped.length} meetings from ${meetings.length} raw rows`);
