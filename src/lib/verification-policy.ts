export const SOURCE_FRESHNESS_HOURS = 48;
export const SOURCE_FRESHNESS_MS = SOURCE_FRESHNESS_HOURS * 60 * 60 * 1000;

export function isSourceFresh(
  status: string,
  verifiedAt: Date | string | null,
  now = new Date(),
) {
  if (status !== "ok" || !verifiedAt) return false;
  const timestamp =
    verifiedAt instanceof Date ? verifiedAt.getTime() : new Date(verifiedAt).getTime();
  return (
    Number.isFinite(timestamp) &&
    now.getTime() - timestamp <= SOURCE_FRESHNESS_MS
  );
}
