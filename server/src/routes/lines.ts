import { Router } from "express";
import { RAIL_LINES } from "../data/railLines";

/**
 * Rail lines endpoint: GET /lines returns the MRT and LRT line shapes drawn on
 * the map.
 */
export const linesRouter = Router();

// GET /lines -> static MRT/LRT rail alignment geometry (one entry per drawn
// segment; a line like EWL or SKLRT may have multiple segments for branches)
linesRouter.get("/", (_req, res) => {
  res.json(RAIL_LINES);
});
