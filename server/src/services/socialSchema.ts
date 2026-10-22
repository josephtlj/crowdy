import { pool } from "./db";

// Tables for the friends and meetup feature. Created on server start (and by
// scripts/init-db.ts) with IF NOT EXISTS, so every teammate's backend can run
// against the shared database without a separate migration step.
//
// friendships: one row per pair. `requester_id` sent the request; the row
// stays "pending" until the addressee accepts. Deleting either account
// removes its friendships.
//
// home_stations: the MRT/LRT station an account usually starts from, so
// friends can be added to a meetup plan without typing their station.
export async function ensureSocialTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requester_id INT NOT NULL,
      addressee_id INT NOT NULL,
      status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_pair (requester_id, addressee_id),
      FOREIGN KEY (requester_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_stations (
      account_id INT PRIMARY KEY,
      station_id VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
}
