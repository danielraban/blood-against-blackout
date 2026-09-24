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

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  shouldTake: () => boolean,
) {
  const pending = [...items];
  const workers = Array.from(
    { length: Math.max(0, Math.min(concurrency, pending.length)) },
    async () => {
      await Promise.resolve();
      while (shouldTake()) {
        const item = pending.shift();
        if (item === undefined) return;
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
  return pending;
}
