import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { feedClaimSql } from "./ingest-claim";

const dialect = new PgDialect();

test("feed claim is one statement that skips locked rows in stale-first order", () => {
  const query = dialect.sqlToQuery(feedClaimSql({ limit: 20 }));
  assert.match(query.sql, /for update skip locked/);
  assert.match(
    query.sql,
    /order by last_attempt_at asc nulls first, last_ok_at asc nulls first/,
  );
  assert.match(query.sql, /leased_until = now\(\) \+ interval '6 minutes'/);
  assert.match(query.sql, /limit/);
  assert.deepEqual(query.params, [20]);
});

test("a catalog page does not reclaim feeds already attempted in this run", () => {
  const query = dialect.sqlToQuery(
    feedClaimSql({ limit: 20, startedBefore: "2026-09-24T15:00:00.000Z" }),
  );
  assert.match(query.sql, /last_attempt_at is null or last_attempt_at < /);
  assert.deepEqual(query.params, ["2026-09-24T15:00:00.000Z", 20]);
});

test("a single-feed claim targets that id and leaves a leased row alone", () => {
  const query = dialect.sqlToQuery(feedClaimSql({ feedId: "boston-aa" }));
  assert.match(query.sql, /id = /);
  assert.match(query.sql, /leased_until is null or leased_until < now\(\)/);
  assert.match(query.sql, /for update skip locked/);
  assert.deepEqual(query.params, ["boston-aa"]);
  assert.doesNotMatch(query.sql, /limit/);
});
