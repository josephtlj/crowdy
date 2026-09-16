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

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(accountId: number): string {
  return jwt.sign({ accountId }, JWT_SECRET, { expiresIn: "30d" });
}

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
