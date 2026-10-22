// Replaces the real MySQL pool before any route module is imported.
// JWT_SECRET has to be set before services/auth.ts loads, which happens
// on the first import of a router — this file is imported first.
process.env.JWT_SECRET ??= "test-secret";
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_USER ??= "test";
process.env.DB_PASSWORD ??= "test";
process.env.DB_NAME ??= "crowdy_test";

import { pool } from "../src/services/db";

export const calls: { sql: string; params: unknown }[] = [];

let nextRows: unknown[] = [];
// Results handed out one per query, in order, before falling back to nextRows.
const queued: unknown[] = [];

export function setNextRows(rows: unknown[]): void {
  nextRows = rows;
}

export function queueResults(...results: unknown[]): void {
  queued.push(...results);
}

export function resetFakePool(): void {
  calls.length = 0;
  nextRows = [];
  queued.length = 0;
}

(pool as unknown as { query: (sql: string, params?: unknown) => Promise<unknown[]> }).query = async (
  sql: string,
  params?: unknown
) => {
  calls.push({ sql, params });
  if (queued.length > 0) return [queued.shift()];
  if (/^\s*INSERT/i.test(sql)) return [{ insertId: 1 }];
  return [nextRows];
};
