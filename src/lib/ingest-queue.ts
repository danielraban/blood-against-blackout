export type IngestQueueFeed = {
  lastOkAt: Date | null;
  lastAttemptAt: Date | null;
};

export function compareFeedsStaleFirst(left: IngestQueueFeed, right: IngestQueueFeed) {
  const leftAttempt = left.lastAttemptAt?.getTime() ?? 0;
  const rightAttempt = right.lastAttemptAt?.getTime() ?? 0;
  if (leftAttempt !== rightAttempt) return leftAttempt - rightAttempt;
  return (left.lastOkAt?.getTime() ?? 0) - (right.lastOkAt?.getTime() ?? 0);
}

export function sortFeedsStaleFirst<T extends IngestQueueFeed>(feeds: T[]) {
  return [...feeds].sort(compareFeedsStaleFirst);
}
