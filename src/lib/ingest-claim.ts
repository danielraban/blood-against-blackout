import { sql, type SQL } from "drizzle-orm";

const FEED_COLUMNS = sql`
  feeds.id,
  feeds.name,
  feeds.url,
  feeds.region_hint,
  feeds.fellowship,
  feeds.format,
  feeds.status,
  feeds.last_attempt_at,
  feeds.last_ok_at,
  feeds.last_error,
  feeds.meeting_count,
  feeds.etag,
  feeds.last_modified,
  feeds.leased_until
`;

export function feedClaimSql(
  options: { limit?: number; feedId?: string; startedBefore?: string } = {},
): SQL {
  const feedIdClause = options.feedId ? sql`and id = ${options.feedId}` : sql``;
  const startedClause = options.startedBefore
    ? sql`and (last_attempt_at is null or last_attempt_at < ${options.startedBefore}::timestamptz)`
    : sql``;
  const limitClause =
    options.limit && options.limit > 0 ? sql`limit ${options.limit}` : sql``;
  return sql`
    with claim as (
      select id
      from feeds
      where status <> 'disabled'
        and (leased_until is null or leased_until < now())
        ${feedIdClause}
        ${startedClause}
      order by last_attempt_at asc nulls first, last_ok_at asc nulls first
      ${limitClause}
      for update skip locked
    )
    update feeds
    set leased_until = now() + interval '6 minutes'
    from claim
    where feeds.id = claim.id
    returning ${FEED_COLUMNS}
  `;
}
