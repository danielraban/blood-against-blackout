import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

export const MIGRATIONS_FOLDER = "drizzle";

type Row = Record<string, unknown>;
type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>;
};

type Journal = {
  entries: { tag: string; when: number }[];
};

export type SchemaFacts = {
  hasFeedsTable: boolean;
  hasMeetingsVerifiedAt: boolean;
  hasMeetingsNeighborhood: boolean;
  hasPlaceCanonicalCache: boolean;
  hasFeedsEtag: boolean;
};

export function alreadyAppliedPrefix(facts: SchemaFacts) {
  const checks = [
    facts.hasFeedsTable,
    facts.hasMeetingsVerifiedAt,
    facts.hasMeetingsNeighborhood || facts.hasPlaceCanonicalCache,
    facts.hasFeedsEtag,
  ];
  let count = 0;
  for (const present of checks) {
    if (!present) break;
    count += 1;
  }
  return count;
}

function readJournal(migrationsFolder: string): Journal {
  return JSON.parse(
    readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
  ) as Journal;
}

function migrationHash(migrationsFolder: string, tag: string) {
  return createHash("sha256")
    .update(readFileSync(`${migrationsFolder}/${tag}.sql`))
    .digest("hex");
}

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = MIGRATIONS_FOLDER,
) {
  const neonSql = neon(databaseUrl);
  const client = neonSql as unknown as SqlClient;
  const db = drizzle(neonSql);
  const journal = readJournal(migrationsFolder);

  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const recorded = await client`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
  `;
  const logs: string[] = [];

  if (recorded.length === 0) {
    const facts = await inspectSchema(client);
    const prefix = Math.min(
      alreadyAppliedPrefix(facts),
      journal.entries.length,
    );
    for (const entry of journal.entries.slice(0, prefix)) {
      const hash = migrationHash(migrationsFolder, entry.tag);
      await client`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        VALUES (${hash}, ${entry.when})
      `;
      logs.push(`Recorded ${entry.tag} (already present on this database)`);
    }
  }

  const before =
    Number(
      (
        await client`
          SELECT created_at FROM drizzle.__drizzle_migrations
          ORDER BY created_at DESC LIMIT 1
        `
      )[0]?.created_at ?? 0,
    ) || 0;

  await migrate(db, { migrationsFolder });

  const applied = journal.entries.filter((entry) => entry.when > before);
  for (const entry of applied) {
    logs.push(`Applied ${entry.tag}`);
  }

  const total = (
    await client`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
  )[0]?.count;
  if (applied.length === 0 && logs.length === 0) {
    logs.push("Already up to date");
  }
  logs.push(`${total} migration(s) recorded`);
  return logs;
}

async function inspectSchema(client: SqlClient): Promise<SchemaFacts> {
  return {
    hasFeedsTable: await tableExists(client, "feeds"),
    hasMeetingsVerifiedAt: await columnExists(client, "meetings", "verified_at"),
    hasMeetingsNeighborhood: await columnExists(
      client,
      "meetings",
      "neighborhood",
    ),
    hasPlaceCanonicalCache: await tableExists(client, "place_canonical_cache"),
    hasFeedsEtag: await columnExists(client, "feeds", "etag"),
  };
}

async function tableExists(client: SqlClient, table: string) {
  const rows = await client`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function columnExists(client: SqlClient, table: string, column: string) {
  const rows = await client`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
    LIMIT 1
  `;
  return rows.length > 0;
}
