import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { cities, meetings } from "./schema";
import { SOURCE_FRESHNESS_HOURS } from "./verification";

function citiesInsertSql(eligibleExtra?: SQL, leadingCtes: SQL = sql``): SQL {
  return sql`
      with ${leadingCtes}eligible as (
        select
          m.*,
          case when m.country is null then substring(m.geohash4 from 1 for 3) else '' end as identity_scope,
          substring(m.geohash4 from 1 for 3) as geo_cluster
        from meetings m
        inner join feeds f on f.id = m.feed_id
        where m.city is not null
          and lower(m.city) not in ('online', 'virtual', 'regional')
          and m.day is not null
          and m.time is not null
          and (
            m.attendance = 'online'
            or (
              m.formatted_address is not null
              and m.lat is not null
              and m.lng is not null
            )
          )
          and f.status = 'ok'
          and f.last_ok_at >= now() - (${SOURCE_FRESHNESS_HOURS} * interval '1 hour')
          ${eligibleExtra ?? sql``}
      ),
      city_cluster_counts as (
        select city, state, country, identity_scope, geo_cluster, count(*) as cluster_count
        from eligible
        where geo_cluster is not null
        group by city, state, country, identity_scope, geo_cluster
      ),
      city_dominant as (
        select city, state, country, identity_scope, geo_cluster
        from (
          select *, row_number() over (
            partition by city, state, country, identity_scope
            order by cluster_count desc, geo_cluster
          ) as cluster_rank
          from city_cluster_counts
        ) ranked_clusters
        where cluster_rank = 1
      ),
      neighborhood_cluster_counts as (
        select neighborhood, city, state, country, identity_scope, geo_cluster, count(*) as cluster_count
        from eligible
        where geo_cluster is not null
          and neighborhood is not null
          and btrim(neighborhood) <> ''
          and lower(neighborhood) <> lower(city)
        group by neighborhood, city, state, country, identity_scope, geo_cluster
      ),
      neighborhood_dominant as (
        select neighborhood, city, state, country, identity_scope, geo_cluster
        from (
          select *, row_number() over (
            partition by neighborhood, city, state, country, identity_scope
            order by cluster_count desc, geo_cluster
          ) as cluster_rank
          from neighborhood_cluster_counts
        ) ranked_clusters
        where cluster_rank = 1
      ),
      city_aggregated as (
        select
          trim(both '-' from regexp_replace(lower(e.city), '[^[:alnum:]]+', '-', 'g'))
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.state), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.country), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || case when e.country is null then '-' || coalesce(e.identity_scope, 'geo') else '' end as slug,
          e.city as label,
          null::text as parent_label,
          array[e.city]::text[] as aliases,
          e.state,
          e.country,
          coalesce(
            avg(e.lat) filter (where e.attendance = 'in-person'),
            avg(e.lat)
          )::real as lat,
          coalesce(
            avg(e.lng) filter (where e.attendance = 'in-person'),
            avg(e.lng)
          )::real as lng,
          coalesce(
            mode() within group (order by e.geohash4) filter (where e.attendance = 'in-person'),
            mode() within group (order by e.geohash4)
          ) as geohash4,
          count(*)::int as meeting_count
        from eligible e
        inner join city_dominant d
          on d.city = e.city
          and d.state is not distinct from e.state
          and d.country is not distinct from e.country
          and d.identity_scope = e.identity_scope
          and d.geo_cluster = e.geo_cluster
        group by e.city, e.state, e.country, e.identity_scope
      ),
      neighborhood_aggregated as (
        select
          trim(both '-' from regexp_replace(lower(e.neighborhood), '[^[:alnum:]]+', '-', 'g'))
            || '-' || trim(both '-' from regexp_replace(lower(e.city), '[^[:alnum:]]+', '-', 'g'))
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.state), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || '-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(e.country), '[^[:alnum:]]+', '-', 'g')), ''), 'xx')
            || case when e.country is null then '-' || coalesce(e.identity_scope, 'geo') else '' end as slug,
          e.neighborhood as label,
          e.city as parent_label,
          array[
            e.neighborhood,
            e.city,
            e.neighborhood || ', ' || e.city
          ]::text[] as aliases,
          e.state,
          e.country,
          coalesce(
            avg(e.lat) filter (where e.attendance = 'in-person'),
            avg(e.lat)
          )::real as lat,
          coalesce(
            avg(e.lng) filter (where e.attendance = 'in-person'),
            avg(e.lng)
          )::real as lng,
          coalesce(
            mode() within group (order by e.geohash4) filter (where e.attendance = 'in-person'),
            mode() within group (order by e.geohash4)
          ) as geohash4,
          count(*)::int as meeting_count
        from eligible e
        inner join neighborhood_dominant d
          on d.neighborhood = e.neighborhood
          and d.city = e.city
          and d.state is not distinct from e.state
          and d.country is not distinct from e.country
          and d.identity_scope = e.identity_scope
          and d.geo_cluster = e.geo_cluster
        group by e.neighborhood, e.city, e.state, e.country, e.identity_scope
      ),
      aggregated as (
        select * from city_aggregated
        union all
        select * from neighborhood_aggregated
      ),
      unique_places as (
        select *
        from (
          select *, row_number() over (
            partition by
              label,
              coalesce(state, ''),
              coalesce(country, ''),
              geohash4
            order by
              case when parent_label is null then 0 else 1 end,
              meeting_count desc,
              slug
          ) as place_rank
          from aggregated
        ) places
        where place_rank = 1
      ),
      ranked as (
        select *, row_number() over (
          partition by slug order by meeting_count desc, label
        ) as rank
        from unique_places
      )
      insert into cities (slug, label, state, country, lat, lng, geohash4, meeting_count, parent_label, aliases)
      select slug, label, state, country, lat, lng, geohash4, meeting_count, parent_label, aliases
      from ranked
      where rank = 1
    `;
}

export function cityRebuildPlan(dirty: boolean, writtenFeedIds: string[]) {
  if (dirty) return { mode: "full" as const };
  if (writtenFeedIds.length > 0) {
    return { mode: "incremental" as const, feedIds: writtenFeedIds };
  }
  return { mode: "skip" as const };
}

export async function rebuildCities() {
  const db = getDb();
  await db.batch([
    db.delete(cities),
    db.execute(citiesInsertSql()),
  ]);
}

export async function rebuildCitiesForFeeds(feedIds: string[]) {
  if (feedIds.length === 0) {
    await rebuildCities();
    return;
  }

  const db = getDb();
  const touchedRows = await db
    .selectDistinct({ geohash4: meetings.geohash4 })
    .from(meetings)
    .where(and(inArray(meetings.feedId, feedIds), isNotNull(meetings.geohash4)));
  const hashes = touchedRows
    .map((row) => row.geohash4)
    .filter((hash): hash is string => hash != null);
  if (hashes.length === 0) return;

  await db.batch([
    db.delete(cities).where(inArray(cities.geohash4, hashes)),
    db.execute(
      citiesInsertSql(
        sql`and m.geohash4 in (select geohash4 from touched)`,
        sql`touched as (
          select distinct geohash4
          from meetings
          where ${inArray(meetings.feedId, feedIds)}
            and geohash4 is not null
        ), `,
      ),
    ),
  ]);
}
