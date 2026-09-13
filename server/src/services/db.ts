import mysql from "mysql2/promise";
import fs from "node:fs";

// SSL is optional here (local MySQL doesn't use it - no DB_SSL_CA_PATH set)
// but required by Aiven's hosted MySQL, which rejects plain connections.
// Reading a real CA cert (rather than e.g. rejectUnauthorized: false) means
// the connection actually verifies it's talking to the genuine Aiven
// server, not just encrypting to whoever's on the other end.
const sslCaPath = process.env.DB_SSL_CA_PATH;

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
  ssl: sslCaPath ? { ca: fs.readFileSync(sslCaPath) } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
});
