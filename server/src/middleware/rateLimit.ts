import { RequestHandler } from "express";

/**
 * Limits how often one client (by IP address) can call a route: at most
 * `max` requests per `windowMs`, after which it gets HTTP 429 until the
 * window resets. Kept in memory, so the count is per server and resets on
 * restart - enough to stop password guessing, username probing, and one
 * client flooding OneMap through the meetup planner.
 * @param options.windowMs - length of the counting window, in milliseconds
 * @param options.max - requests allowed per client per window
 * @param options.message - error text sent with the 429
 * @returns Express middleware
 */
export function rateLimit(options: { windowMs: number; max: number; message: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    // Drop expired entries now and then so the map can't grow without limit.
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }

    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    if (entry.count >= options.max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: options.message });
    }
    entry.count++;
    next();
  };
}
