import { Router } from "express";
import { pool } from "../services/db";
import { hashPassword, verifyPassword, signToken } from "../services/auth";
import { RowDataPacket } from "mysql2";

export const authRouter = Router();

interface AccountRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
}

// Letters, numbers, underscore - no spaces or symbols, so it's always safe
// to display as-is with no escaping to worry about. The accounts.username
// column's collation (utf8mb4_unicode_ci, same as the rest of this
// database) is case-insensitive, so "Joseph" and "joseph" collide against
// the UNIQUE constraint automatically - no extra normalization needed here.
function isValidUsername(username: unknown): username is string {
  return typeof username === "string" && /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

// POST /auth/signup { username, password } -> creates the account, returns
// a session token straight away (no separate verification step).
authRouter.post("/signup", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!isValidUsername(username) || typeof password !== "string" || password.length < 8) {
    return res
      .status(400)
      .json({ error: "A username (3-24 letters/numbers/underscore) and a password (8+ characters) are required" });
  }

  const [existing] = await pool.query<AccountRow[]>("SELECT id FROM accounts WHERE username = ?", [
    username,
  ]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "This username is already taken" });
  }

  const passwordHash = await hashPassword(password);
  const [result] = await pool.query("INSERT INTO accounts (username, password_hash) VALUES (?, ?)", [
    username,
    passwordHash,
  ]);
  const accountId = (result as { insertId: number }).insertId;

  res.status(201).json({ token: signToken(accountId), accountId });
});

// POST /auth/login { username, password } -> verifies credentials, returns
// a session token. Same "invalid username or password" message for both a
// missing account and a wrong password, so a login attempt can't be used
// to check which usernames are registered.
authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!isValidUsername(username) || typeof password !== "string") {
    return res.status(400).json({ error: "Invalid username or password" });
  }

  const [rows] = await pool.query<AccountRow[]>(
    "SELECT id, password_hash FROM accounts WHERE username = ?",
    [username]
  );
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  res.json({ token: signToken(account.id), accountId: account.id });
});
