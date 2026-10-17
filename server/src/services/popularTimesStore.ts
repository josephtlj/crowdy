import { RowDataPacket } from "mysql2";
import { pool } from "./db";

// The Popular Times cache, shared through the hosted database so every
// teammate's backend works from one copy instead of each scraping all 100+
// venues separately. Five people scraping the same venues every day is
// five times the automated traffic to Google - exactly the pattern most
// likely to get the scraper blocked - and a fresh clone otherwise shows
// "Unavailable" everywhere until its own first batch finishes.
//
// The database is a shared copy, never the only one: popularTimes.ts keeps
// reading from memory and keeps its local file, so a powered-off or
// unreachable database (Aiven's free tier powers off when idle) only means
// falling back to what this machine already has.

export interface StoredEntry {
  result: unknown | null;
  timestamp: number;
}

interface CacheRow extends RowDataPacket {
  venue_id: string;
  result: unknown | null;
  scraped_at_ms: number | string;
}

// Created on first use rather than through scripts/init-db.ts, so nobody on
// the team has to remember a setup step - and so it comes back on its own if
// the database is ever restored without it.
let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS popular_times_cache (
          venue_id VARCHAR(255) PRIMARY KEY,
          result JSON NULL,
          scraped_at_ms BIGINT NOT NULL
        )`
      )
      .then(() => undefined);
    // A failed attempt (database asleep) is retried next time rather than
    // remembered as permanently failed.
    tableReady.catch(() => {
      tableReady = null;
    });
  }
  return tableReady;
}

// One message when the database becomes unreachable and one when it comes
// back, rather than an error for every venue written in between.
let unreachable = false;
function noteFailure(err: unknown): void {
  if (unreachable) return;
  unreachable = true;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Popular Times: database unreachable, using this machine's cache only (${message})`);
}
function noteSuccess(): void {
  if (!unreachable) return;
  unreachable = false;
  console.log("Popular Times: database reachable again, sharing the cache.");
}

export async function loadStoredEntries(): Promise<Map<string, StoredEntry> | null> {
  try {
    await ensureTable();
    const [rows] = await pool.query<CacheRow[]>("SELECT venue_id, result, scraped_at_ms FROM popular_times_cache");
    noteSuccess();
    return new Map(
      rows.map((row) => [row.venue_id, { result: row.result, timestamp: Number(row.scraped_at_ms) }])
    );
  } catch (err) {
    noteFailure(err);
    return null;
  }
}

// Written only if this entry is newer than what's stored, and a failed
// scrape (null result) never replaces a good one. Without the second rule,
// a teammate whose scrape of a venue failed would wipe the working data
// someone else had just saved for it.
export async function storeEntry(venueId: string, entry: StoredEntry): Promise<void> {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO popular_times_cache (venue_id, result, scraped_at_ms)
       VALUES (?, ?, ?) AS incoming
       ON DUPLICATE KEY UPDATE
         result = IF(incoming.scraped_at_ms > popular_times_cache.scraped_at_ms
                     AND (incoming.result IS NOT NULL OR popular_times_cache.result IS NULL),
                     incoming.result, popular_times_cache.result),
         scraped_at_ms = IF(incoming.scraped_at_ms > popular_times_cache.scraped_at_ms
                            AND (incoming.result IS NOT NULL OR popular_times_cache.result IS NULL),
                            incoming.scraped_at_ms, popular_times_cache.scraped_at_ms)`,
      [venueId, entry.result === null ? null : JSON.stringify(entry.result), entry.timestamp]
    );
    noteSuccess();
  } catch (err) {
    noteFailure(err);
  }
}
