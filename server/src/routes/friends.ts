import { Router } from "express";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "../services/db";
import { requireAuth } from "../middleware/requireAuth";
import { STATIONS } from "../data/stations";

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const STATION_IDS = new Set(STATIONS.map((s) => s.id));

interface FriendshipRow extends RowDataPacket {
  requester_id: number;
  addressee_id: number;
  status: "pending" | "accepted";
  other_id: number;
  username: string;
  station_id: string | null;
}

interface AccountIdRow extends RowDataPacket {
  id: number;
}

interface HomeStationRow extends RowDataPacket {
  station_id: string;
}

function otherAccountId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /friends -> this account's home station, accepted friends (with their
// home stations), and pending requests in both directions. A friend's home
// station is only shared once the request has been accepted.
friendsRouter.get("/", async (_req, res) => {
  const me = res.locals.accountId as number;

  const [own] = await pool.query<HomeStationRow[]>("SELECT station_id FROM home_stations WHERE account_id = ?", [me]);
  const [rows] = await pool.query<FriendshipRow[]>(
    `SELECT f.requester_id, f.addressee_id, f.status, a.id AS other_id, a.username, h.station_id
       FROM friendships f
       JOIN accounts a ON a.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
       LEFT JOIN home_stations h ON h.account_id = a.id
      WHERE f.requester_id = ? OR f.addressee_id = ?
      ORDER BY a.username`,
    [me, me, me]
  );

  res.json({
    homeStationId: own[0]?.station_id ?? null,
    friends: rows
      .filter((r) => r.status === "accepted")
      .map((r) => ({ accountId: r.other_id, username: r.username, homeStationId: r.station_id ?? null })),
    incoming: rows
      .filter((r) => r.status === "pending" && r.addressee_id === me)
      .map((r) => ({ accountId: r.other_id, username: r.username })),
    outgoing: rows
      .filter((r) => r.status === "pending" && r.requester_id === me)
      .map((r) => ({ accountId: r.other_id, username: r.username })),
  });
});

// POST /friends/requests { username } -> sends a friend request. If that
// person had already sent this account a request, it is accepted instead.
friendsRouter.post("/requests", async (req, res) => {
  const me = res.locals.accountId as number;
  const { username } = req.body ?? {};
  if (typeof username !== "string" || username.trim().length === 0) {
    return res.status(400).json({ error: "A username is required" });
  }

  const [accounts] = await pool.query<AccountIdRow[]>("SELECT id FROM accounts WHERE username = ?", [username.trim()]);
  const other = accounts[0]?.id;
  if (!other) return res.status(404).json({ error: "No account with that username" });
  if (other === me) return res.status(400).json({ error: "You can't add yourself" });

  const [existing] = await pool.query<FriendshipRow[]>(
    `SELECT requester_id, addressee_id, status FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    [me, other, other, me]
  );
  const row = existing[0];
  if (row?.status === "accepted") return res.status(409).json({ error: "You're already friends" });
  if (row && row.requester_id === me) return res.status(409).json({ error: "Friend request already sent" });
  if (row) {
    await pool.query("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?", [
      other,
      me,
    ]);
    return res.status(200).json({ status: "accepted" });
  }

  await pool.query("INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)", [me, other]);
  res.status(201).json({ status: "pending" });
});

// POST /friends/requests/:accountId/accept -> accepts a request that
// account sent to this one.
friendsRouter.post("/requests/:accountId/accept", async (req, res) => {
  const me = res.locals.accountId as number;
  const other = otherAccountId(req.params.accountId);
  if (!other) return res.status(400).json({ error: "Invalid account" });

  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
    [other, me]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "No pending request from that account" });
  res.status(204).send();
});

// DELETE /friends/:accountId -> removes a friend, declines their request,
// or cancels a request this account sent - whichever row exists.
friendsRouter.delete("/:accountId", async (req, res) => {
  const me = res.locals.accountId as number;
  const other = otherAccountId(req.params.accountId);
  if (!other) return res.status(400).json({ error: "Invalid account" });

  await pool.query(
    `DELETE FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    [me, other, other, me]
  );
  res.status(204).send();
});

// PUT /friends/home-station { stationId } -> sets (or with null, clears)
// the station this account usually starts from.
friendsRouter.put("/home-station", async (req, res) => {
  const me = res.locals.accountId as number;
  const { stationId } = req.body ?? {};

  if (stationId === null) {
    await pool.query("DELETE FROM home_stations WHERE account_id = ?", [me]);
    return res.status(204).send();
  }
  if (typeof stationId !== "string" || !STATION_IDS.has(stationId)) {
    return res.status(400).json({ error: "Unknown station" });
  }
  await pool.query(
    `INSERT INTO home_stations (account_id, station_id) VALUES (?, ?) AS incoming
       ON DUPLICATE KEY UPDATE station_id = incoming.station_id`,
    [me, stationId]
  );
  res.status(204).send();
});
