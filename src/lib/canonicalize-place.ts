import { eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "./db";
import { placeCanonicalCache } from "./schema";
import {
  locationNeedsEnrichment,
  mergeResolvedPlace,
  normalizePlaceFields,
  placeFingerprint,
  reverseGeocodeKey,
  type PlaceFields,
} from "./location";

const CANONICAL_PLACE_SCHEMA = z.object({
  city: z.string().nullable(),
  neighborhood: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  postalCode: z.string().nullable(),
  aliases: z.array(z.string()),
  confidence: z.number(),
});

type CachedPlace = PlaceFields & {
  aliases: string[];
  confidence: number | null;
  source: string;
};

export type PlaceEnrichmentBudget = {
  reverse: number;
  ai: number;
};

const NOMINATIM_HEADERS = {
  "User-Agent": "blood-against-blackout/1.0 (meeting finder)",
  Accept: "application/json",
};

let aiBlocked = false;
let loggedAiSkip = false;

function hasAiGatewayAuth() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

export function canUseAiCanonicalization() {
  return !aiBlocked && hasAiGatewayAuth();
}

function logAiSkip(reason: string) {
  if (loggedAiSkip) return;
  loggedAiSkip = true;
  console.warn("place.canonicalize.ai_skipped", { reason });
}

function cachedToPlace(row: typeof placeCanonicalCache.$inferSelect): CachedPlace {
  return {
    city: row.city,
    neighborhood: row.neighborhood,
    state: row.state,
    country: row.country,
    postalCode: row.postalCode,
    aliases: row.aliases ?? [],
    confidence: row.confidence,
    source: row.source,
  };
}

async function readCache(fingerprint: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(placeCanonicalCache)
    .where(eq(placeCanonicalCache.fingerprint, fingerprint))
    .limit(1);
  return rows[0] ? cachedToPlace(rows[0]) : null;
}

async function writeCache(fingerprint: string, place: CachedPlace) {
  const db = getDb();
  await db
    .insert(placeCanonicalCache)
    .values({
      fingerprint,
      city: place.city,
      neighborhood: place.neighborhood,
      state: place.state,
      country: place.country,
      postalCode: place.postalCode,
      aliases: place.aliases,
      confidence: place.confidence,
      source: place.source,
      cachedAt: new Date(),
    })
    .onConflictDoNothing();
}

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  neighbourhood?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country_code?: string;
  "ISO3166-2-lvl4"?: string;
};

function placeFromNominatim(address: NominatimAddress): PlaceFields {
  const iso = address["ISO3166-2-lvl4"];
  const isoState = iso?.includes("-") ? iso.split("-")[1] : null;
  return normalizePlaceFields({
    city: address.city ?? address.town ?? address.village ?? address.municipality ?? null,
    neighborhood: address.suburb ?? address.neighbourhood ?? null,
    state: isoState ?? address.state ?? null,
    postalCode: address.postcode ?? null,
    country: address.country_code?.toUpperCase() ?? null,
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<PlaceFields | null> {
  const key = reverseGeocodeKey(lat, lng);
  const cached = await readCache(key);
  if (cached) return cached;

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  if (!response.ok) return null;
  const data = (await response.json()) as { address?: NominatimAddress };
  if (!data.address) return null;
  const place = placeFromNominatim(data.address);
  await writeCache(key, {
    ...place,
    aliases: [place.city, place.neighborhood].filter((value): value is string => Boolean(value)),
    confidence: 0.9,
    source: "geocode",
  });
  return place;
}

async function canonicalizeWithAi(
  place: PlaceFields,
  lat: number | null,
  lng: number | null,
): Promise<PlaceFields | null> {
  if (!canUseAiCanonicalization()) {
    logAiSkip(
      "Set AI_GATEWAY_API_KEY in .env.local for local ingest, or run ingest on Vercel where OIDC is available.",
    );
    return null;
  }
  try {
    const result = await generateText({
      model: "openai/gpt-5.4-mini",
      output: Output.object({ schema: CANONICAL_PLACE_SCHEMA }),
      prompt: `Canonicalize this meeting location into one municipality and optional neighborhood.
Keep geographically distinct same-named places separate (London GB vs London ON, Brooklyn NY vs Brooklyn CT).
Never merge places more than 40km apart. If unsure, return low confidence.
Coordinates: ${lat ?? "unknown"}, ${lng ?? "unknown"}
Input JSON: ${JSON.stringify(place)}`,
    });
    const output = result.output;
    if (!output || output.confidence < 0.6) return null;
    return normalizePlaceFields({
      city: output.city,
      neighborhood: output.neighborhood,
      state: output.state,
      postalCode: output.postalCode,
      country: output.country,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/unauthenticated|AI_GATEWAY_API_KEY/i.test(message)) {
      aiBlocked = true;
      logAiSkip(
        "AI Gateway is unauthenticated. Ingest will keep using rules and reverse geocode.",
      );
      return null;
    }
    console.error("place.canonicalize.ai_failed", { message: message.slice(0, 300) });
    return null;
  }
}

export async function enrichPlace(
  input: PlaceFields,
  lat: number | null,
  lng: number | null,
  budget: PlaceEnrichmentBudget,
): Promise<PlaceFields> {
  let place = normalizePlaceFields(input);
  if (!locationNeedsEnrichment(place)) return place;

  const fingerprint = placeFingerprint(place, lat, lng);
  const cached = await readCache(fingerprint);
  if (cached) return mergeResolvedPlace(place, cached);

  if (lat != null && lng != null && budget.reverse > 0) {
    budget.reverse -= 1;
    const geo = await reverseGeocode(lat, lng);
    if (geo) {
      place = mergeResolvedPlace(place, geo);
      await writeCache(fingerprint, {
        ...place,
        aliases: [place.city, place.neighborhood].filter((value): value is string => Boolean(value)),
        confidence: 0.9,
        source: "geocode",
      });
      if (!locationNeedsEnrichment(place)) return place;
    }
  }

  if (budget.ai > 0 && canUseAiCanonicalization()) {
    budget.ai -= 1;
    const ai = await canonicalizeWithAi(place, lat, lng);
    if (aiBlocked) budget.ai = 0;
    if (ai) {
      place = mergeResolvedPlace(place, ai);
      await writeCache(fingerprint, {
        ...place,
        aliases: [place.city, place.neighborhood].filter((value): value is string => Boolean(value)),
        confidence: 0.8,
        source: "ai",
      });
    }
  }

  return place;
}
