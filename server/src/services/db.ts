import mysql from "mysql2/promise";

// A pool (not a single connection) so concurrent requests each get their
// own connection instead of queuing behind one shared one - the standard
// pattern for a long-running server, same reasoning as the shared
// Puppeteer browser instance being reused rather than relaunched per
// request elsewhere in this codebase, just for DB connections instead.
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
});
