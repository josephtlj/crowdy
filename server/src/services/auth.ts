import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set - check server/.env");
  }
  return secret;
}
const JWT_SECRET = getJwtSecret();

const SALT_ROUNDS = 10;

/**
 * Hashes a password with bcrypt for storage. The plain password is never stored.
 * @param password - the user's password
 * @returns the salted hash
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Checks a password against its stored hash.
 * @param password - the password the user entered
 * @param hash - the stored hash
 * @returns true if they match
 */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a signed sign-in token (JWT) for an account, valid for 30 days.
 * @param accountId - the account's id
 * @returns the token the app sends with its requests
 */
export function signToken(accountId: number): string {
  return jwt.sign({ accountId }, JWT_SECRET, { expiresIn: "30d" });
}

/**
 * Checks a sign-in token's signature and expiry.
 * @param token - the token from the request
 * @returns the account id inside it, or null if the token is invalid or expired
 */
export function verifyToken(token: string): { accountId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === "object" && typeof payload.accountId === "number") {
      return { accountId: payload.accountId };
    }
    return null;
  } catch {
    return null;
  }
}
