export type IngestQueueFeed = {
  lastOkAt: Date | null;
  lastAttemptAt: Date | null;
};

export function compareFeedsStaleFirst(left: IngestQueueFeed, right: IngestQueueFeed) {
  const leftOk = left.lastOkAt?.getTime() ?? 0;
  const rightOk = right.lastOkAt?.getTime() ?? 0;
  if (leftOk !== rightOk) return leftOk - rightOk;
  return (left.lastAttemptAt?.getTime() ?? 0) - (right.lastAttemptAt?.getTime() ?? 0);
}

export function sortFeedsStaleFirst<T extends IngestQueueFeed>(feeds: T[]) {
  return [...feeds].sort(compareFeedsStaleFirst);
}
