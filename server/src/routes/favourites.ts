import { Router } from "express";
import { RowDataPacket } from "mysql2";
import { pool } from "../services/db";
import { requireAuth } from "../middleware/requireAuth";

export const favouritesRouter = Router();
favouritesRouter.use(requireAuth);

interface FavouriteRow extends RowDataPacket {
  venue_id: string;
}

// GET /favourites -> every venue id this account has saved.
favouritesRouter.get("/", async (_req, res) => {
  const accountId = res.locals.accountId as number;
  const [rows] = await pool.query<FavouriteRow[]>(
    "SELECT venue_id FROM favourites WHERE account_id = ?",
    [accountId]
  );
  res.json(rows.map((r) => r.venue_id));
});

// POST /favourites { venueId } -> save one venue. Idempotent - saving an
// already-saved venue just leaves it saved, matching how the on-device
// toggle already behaves.
favouritesRouter.post("/", async (req, res) => {
  const accountId = res.locals.accountId as number;
  const { venueId } = req.body ?? {};
  if (typeof venueId !== "string" || venueId.length === 0) {
    return res.status(400).json({ error: "venueId is required" });
  }
  await pool.query("INSERT IGNORE INTO favourites (account_id, venue_id) VALUES (?, ?)", [
    accountId,
    venueId,
  ]);
  res.status(204).send();
});

// DELETE /favourites/:venueId -> unsave one venue.
favouritesRouter.delete("/:venueId", async (req, res) => {
  const accountId = res.locals.accountId as number;
  await pool.query("DELETE FROM favourites WHERE account_id = ? AND venue_id = ?", [
    accountId,
    req.params.venueId,
  ]);
  res.status(204).send();
});

// POST /favourites/merge { venueIds } -> bulk-saves a batch of venue ids in
// one call. Called once, right after login, with whatever was saved
// on-device as a guest (see app's savedVenues.ts) - per the Lab 1 NFRs,
// logging in merges local favourites into the account rather than
// discarding them. Same idempotent insert as the single-venue route, so
// re-running this (e.g. logging in again later) is harmless.
favouritesRouter.post("/merge", async (req, res) => {
  const accountId = res.locals.accountId as number;
  const { venueIds } = req.body ?? {};
  if (!Array.isArray(venueIds) || !venueIds.every((id) => typeof id === "string")) {
    return res.status(400).json({ error: "venueIds must be an array of strings" });
  }
  if (venueIds.length === 0) {
    return res.status(204).send();
  }

  const values = venueIds.map((venueId) => [accountId, venueId]);
  await pool.query("INSERT IGNORE INTO favourites (account_id, venue_id) VALUES ?", [values]);
  res.status(204).send();
});
