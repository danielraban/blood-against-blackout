import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { SOURCE_FRESHNESS_HOURS } from "./verification";

type CountRow = {
  public_meetings: number | string;
  invalid_schedule: number | string;
  missing_address: number | string;
  invalid_coordinates: number | string;
  missing_city: number | string;
  malformed_city_labels: number | string;
  duplicate_meeting_ids: number | string;
  stale_feeds: number | string;
  suppressed_meetings: number | string;
  incomplete_runs: number | string;
};

export type MappingAnomaly = {
  city: string;
  state: string | null;
  country: string | null;
  meetings: number;
  latitudeSpan: number;
  longitudeSpan: number;
};

export type MeetingAudit = {
  checkedAt: string;
  freshnessHours: number;
  safe: boolean;
  publicMeetings: number;
  invalidSchedule: number;
  missingAddress: number;
  invalidCoordinates: number;
  missingCity: number;
  malformedCityLabels: number;
  duplicateMeetingIds: number;
  staleFeeds: number;
  suppressedMeetings: number;
  incompleteRuns: number;
  mappingAnomalies: MappingAnomaly[];
};

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function runMeetingAudit(): Promise<MeetingAudit> {
  const db = getDb();
  const [countsResult, anomaliesResult] = await Promise.all([
    db.execute(sql`
      with fresh_feeds as (
        select id
        from feeds
        where status = 'ok'
          and last_ok_at >= now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')
      ),
      public_rows as (
        select m.*
        from meetings m
        inner join fresh_feeds f on f.id = m.feed_id
      )
      select
        (select count(*) from public_rows)::int as public_meetings,
        (select count(*) from public_rows where day is null or time is null)::int as invalid_schedule,
        (select count(*) from public_rows where attendance <> 'online' and nullif(btrim(formatted_address), '') is null)::int as missing_address,
        (select count(*) from public_rows where attendance <> 'online' and (lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180))::int as invalid_coordinates,
        (select count(*) from public_rows where attendance <> 'online' and nullif(btrim(city), '') is null)::int as missing_city,
        (select count(*) from public_rows where attendance <> 'online' and (
          lower(btrim(city)) in ('online', 'virtual', 'regional')
          or btrim(city) ~ '^[A-Z]{2,3}$'
          or length(btrim(city)) > 80
        ))::int as malformed_city_labels,
        (select count(*) from (
          select feed_id, slug
          from meetings
          group by feed_id, slug
          having count(*) > 1
        ) duplicates)::int as duplicate_meeting_ids,
        (select count(*) from feeds where status <> 'ok' or last_ok_at is null or last_ok_at < now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour'))::int as stale_feeds,
        (select coalesce(sum(meeting_count), 0) from feeds where status <> 'ok' or last_ok_at is null or last_ok_at < now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour'))::int as suppressed_meetings,
        (select count(*) from ingest_runs where status in ('running', 'incomplete'))::int as incomplete_runs
    `),
    db.execute(sql`
      with eligible as (
        select
          m.city,
          m.state,
          m.country,
          case when m.country is null then substring(m.geohash4 from 1 for 3) else '' end as geo_scope,
          substring(m.geohash4 from 1 for 3) as geo_cluster,
          m.lat,
          m.lng
        from meetings m
        inner join feeds f on f.id = m.feed_id
        where f.status = 'ok'
          and f.last_ok_at >= now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')
          and m.attendance <> 'online'
          and m.city is not null
          and m.lat is not null
          and m.lng is not null
      ),
      cluster_counts as (
        select city, state, country, geo_scope, geo_cluster, count(*) as cluster_count
        from eligible
        group by city, state, country, geo_scope, geo_cluster
      ),
      dominant as (
        select city, state, country, geo_scope, geo_cluster
        from (
          select *, row_number() over (
            partition by city, state, country, geo_scope
            order by cluster_count desc, geo_cluster
          ) as cluster_rank
          from cluster_counts
        ) ranked
        where cluster_rank = 1
      ),
      grouped as (
        select
          e.city,
          e.state,
          e.country,
          count(*)::int as meetings,
          max(e.lat) - min(e.lat) as latitude_span,
          max(e.lng) - min(e.lng) as longitude_span
        from eligible e
        inner join dominant d
          on d.city = e.city
          and d.state is not distinct from e.state
          and d.country is not distinct from e.country
          and d.geo_scope = e.geo_scope
          and d.geo_cluster = e.geo_cluster
        group by e.city, e.state, e.country, e.geo_scope
      )
      select city, state, country, meetings, latitude_span, longitude_span
      from grouped
      where latitude_span > 1.5 or longitude_span > 1.5
      order by meetings desc
      limit 100
    `),
  ]);

  const row = resultRows<CountRow>(countsResult)[0];
  const mappingAnomalies = resultRows<{
    city: string;
    state: string | null;
    country: string | null;
    meetings: number | string;
    latitude_span: number | string;
    longitude_span: number | string;
  }>(anomaliesResult).map((item) => ({
    city: item.city,
    state: item.state,
    country: item.country,
    meetings: count(item.meetings),
    latitudeSpan: count(item.latitude_span),
    longitudeSpan: count(item.longitude_span),
  }));

  const audit: MeetingAudit = {
    checkedAt: new Date().toISOString(),
    freshnessHours: SOURCE_FRESHNESS_HOURS,
    publicMeetings: count(row?.public_meetings),
    invalidSchedule: count(row?.invalid_schedule),
    missingAddress: count(row?.missing_address),
    invalidCoordinates: count(row?.invalid_coordinates),
    missingCity: count(row?.missing_city),
    malformedCityLabels: count(row?.malformed_city_labels),
    duplicateMeetingIds: count(row?.duplicate_meeting_ids),
    staleFeeds: count(row?.stale_feeds),
    suppressedMeetings: count(row?.suppressed_meetings),
    incompleteRuns: count(row?.incomplete_runs),
    mappingAnomalies,
    safe: false,
  };
  audit.safe =
    audit.invalidSchedule === 0 &&
    audit.missingAddress === 0 &&
    audit.invalidCoordinates === 0 &&
    audit.missingCity === 0 &&
    audit.malformedCityLabels === 0 &&
    audit.duplicateMeetingIds === 0 &&
    audit.mappingAnomalies.length === 0;
  return audit;
}
