/** Fixed-window counters in memory. One process serves the app, so a map is enough. */
export function createLimiter() {
  const windows = new Map<string, { start: number; ms: number; count: number }>();
  const live = (key: string, now: number) => {
    const w = windows.get(key);
    return w && now - w.start < w.ms ? w : undefined;
  };
  return {
    /** True while one more hit on `key` stays within `max` per window. Counts nothing. */
    room(key: string, max: number, now: number): boolean {
      return (live(key, now)?.count ?? 0) < max;
    },
    /** Counts one hit on `key`. */
    hit(key: string, windowMs: number, now: number): void {
      if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start >= w.ms) windows.delete(k);
      const w = live(key, now);
      if (w) w.count++;
      else windows.set(key, { start: now, ms: windowMs, count: 1 });
    },
  };
}
