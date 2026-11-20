/**
 * Exponential backoff with jitter: about 1s, 2s, 4s, 8s ... capped at 15s,
 * so a restarting server is not hammered by every open tab at once.
 */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
  const jitter = 0.8 + random() * 0.4;
  return Math.round(base * jitter);
}
