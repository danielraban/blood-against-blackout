import { createHash } from "node:crypto";

export const INGEST_CATALOG_ID = "feeds";
export const INGEST_CITIES_ID = "cities";
export const CITIES_DIRTY = "dirty";
export const CITIES_CLEAN = "clean";

export function hashFeedCatalog(feedsJson: string, bmltJson: string) {
  return createHash("sha256").update(feedsJson).update("\0").update(bmltJson).digest("hex");
}
