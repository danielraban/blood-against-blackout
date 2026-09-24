export function createNominatimGate(
  intervalMs = 1100,
  now = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  let chain: Promise<void> = Promise.resolve();
  let nextAt = 0;

  return function scheduleNominatim<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = Math.max(0, nextAt - now());
      if (wait > 0) await sleep(wait);
      nextAt = now() + intervalMs;
      return task();
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export const scheduleNominatim = createNominatimGate();
