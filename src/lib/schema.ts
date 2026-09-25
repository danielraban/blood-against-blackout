import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const feeds = pgTable("feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  regionHint: text("region_hint"),
  fellowship: text("fellowship").notNull().default("aa"),
  format: text("format").notNull().default("tsml"),
  status: text("status").notNull().default("pending"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
  meetingCount: integer("meeting_count").notNull().default(0),
  etag: text("etag"),
  lastModified: text("last_modified"),
  leasedUntil: timestamp("leased_until", { withTimezone: true }),
});

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    url: text("url"),
    locationText: text("location_text"),
    feedbackEmails: text("feedback_emails").array().notNull().default([]),
  },
  (table) => [index("entities_feed_idx").on(table.feedId)],
);

export const meetings = pgTable(
  "meetings",
  {
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    groupName: text("group_name"),
    day: integer("day"),
    time: text("time"),
    endTime: text("end_time"),
    timezone: text("timezone"),
    types: text("types").array().notNull().default([]),
    attendance: text("attendance").notNull(),
    fellowship: text("fellowship").notNull().default("aa"),
    locationName: text("location_name"),
    address: text("address"),
    city: text("city"),
    neighborhood: text("neighborhood"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country"),
    formattedAddress: text("formatted_address"),
    lat: real("lat"),
    lng: real("lng"),
    geohash4: text("geohash4"),
    conferenceUrl: text("conference_url"),
    conferencePhone: text("conference_phone"),
    notes: text("notes"),
    locationNotes: text("location_notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.slug] }),
    index("meetings_geohash_idx").on(table.geohash4),
    index("meetings_attendance_idx").on(table.attendance),
    index("meetings_city_idx").on(table.city),
    index("meetings_fellowship_idx").on(table.fellowship),
  ],
);

export const cities = pgTable(
  "cities",
  {
    slug: text("slug").primaryKey(),
    label: text("label").notNull(),
    state: text("state"),
    country: text("country"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    geohash4: text("geohash4").notNull(),
    meetingCount: integer("meeting_count").notNull().default(0),
    parentLabel: text("parent_label"),
    aliases: text("aliases").array().notNull().default([]),
  },
  (table) => [
    uniqueIndex("cities_label_state_country_idx").on(
      table.label,
      table.state,
      table.country,
      table.geohash4,
    ),
    index("cities_geohash_idx").on(table.geohash4),
  ],
);

export const ingestCatalog = pgTable("ingest_catalog", {
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  seededAt: timestamp("seeded_at", { withTimezone: true }).notNull(),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  feedsOk: integer("feeds_ok").notNull().default(0),
  feedsFail: integer("feeds_fail").notNull().default(0),
  meetingsUpserted: integer("meetings_upserted").notNull().default(0),
  errorSummary: text("error_summary"),
  status: text("status").notNull().default("running"),
});

export const geocodeCache = pgTable("geocode_cache", {
  query: text("query").primaryKey(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull(),
});

export const placeCanonicalCache = pgTable("place_canonical_cache", {
  fingerprint: text("fingerprint").primaryKey(),
  city: text("city"),
  neighborhood: text("neighborhood"),
  state: text("state"),
  country: text("country"),
  postalCode: text("postal_code"),
  aliases: text("aliases").array().notNull().default([]),
  confidence: real("confidence"),
  source: text("source").notNull(),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull(),
});

export const meetingNoteEmbeddings = pgTable(
  "meeting_note_embeddings",
  {
    feedId: text("feed_id").notNull(),
    slug: text("slug").notNull(),
    contentHash: text("content_hash").notNull(),
    geohash4: text("geohash4"),
    embedding: vector("embedding", { dimensions: 512 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.slug] }),
    index("meeting_note_embeddings_geohash_idx").on(table.geohash4),
    foreignKey({
      columns: [table.feedId, table.slug],
      foreignColumns: [meetings.feedId, meetings.slug],
      name: "meeting_note_embeddings_meeting_fk",
    }).onDelete("cascade"),
  ],
);
