// One-off script: creates the accounts/favourites schema. Safe to re-run -
// every statement is idempotent (CREATE TABLE IF NOT EXISTS).
import path from "node:path";

process.loadEnvFile(path.join(__dirname, "..", ".env"));

import { pool } from "../src/services/db";

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(24) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favourites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      venue_id VARCHAR(255) NOT NULL,
      saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_account_venue (account_id, venue_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  console.log("Schema ready: accounts, favourites.");
  await pool.end();
}

main().catch((err) => {
  console.error("init-db failed:", err);
  process.exit(1);
});
