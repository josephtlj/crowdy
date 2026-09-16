import { RequestHandler } from "express";
import { verifyToken } from "../services/auth";

// Reads "Authorization: Bearer <token>", verifies it, and attaches the
// account id to res.locals for downstream routes - res.locals rather than
// augmenting Express's Request type, so no global type declaration needed
// for one small addition.
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  res.locals.accountId = payload.accountId;
  next();
};
