import { Router } from "express";
import { getVenues } from "../data/venues";
import { getHeatmapPng } from "../services/heatmapImage";
import { HEATMAP_BOUNDS } from "../services/heatmap";

export const heatmapRouter = Router();

// GET /heatmap/image.png -> the pre-rendered crowd heatmap overlay, sized
// and positioned against HEATMAP_BOUNDS below.
heatmapRouter.get("/image.png", async (_req, res) => {
  try {
    const venues = await getVenues();
    const png = await getHeatmapPng(venues);
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    console.error("Heatmap image generation failed:", err);
    res.status(500).json({ error: "Failed to generate heatmap image" });
  }
});

// GET /heatmap/bounds -> the exact geographic box image.png is rendered
// against, so the app can place it on the map with react-native-maps'
// Overlay `bounds` prop without hardcoding a second copy of these numbers.
heatmapRouter.get("/bounds", (_req, res) => {
  res.json(HEATMAP_BOUNDS);
});
