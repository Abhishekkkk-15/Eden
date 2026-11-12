/**
 * Lightweight async concurrency limiter (similar to p-limit), zero dependencies.
 */
export function createAsyncPool(concurrency: number) {
  const limit = Math.max(1, concurrency);
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      if (run) run();
    }
  };

  return async function runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}
