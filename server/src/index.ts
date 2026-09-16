process.loadEnvFile(); // reads server/.env - must run before anything reads process.env

import express from "express";
import cors from "cors";
import { venuesRouter } from "./routes/venues";
import { linesRouter } from "./routes/lines";
import { authRouter } from "./routes/auth";
import { favouritesRouter } from "./routes/favourites";
import { heatmapRouter } from "./routes/heatmap";
import { startPopularTimesScheduler } from "./services/popularTimesScheduler";
import { closeBrowser } from "./services/popularTimes";
import { pool } from "./services/db";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/venues", venuesRouter);
app.use("/lines", linesRouter);
app.use("/auth", authRouter);
app.use("/favourites", favouritesRouter);
app.use("/heatmap", heatmapRouter);

startPopularTimesScheduler();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "crowdy-server" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`Crowdy server listening on http://localhost:${PORT}`);
});

// listen() failing (almost always EADDRINUSE - a previous run's process
// still holding the port) is an async 'error' event, not a throw - with no
// handler here it became an uncaught exception, which is what was making
// ts-node-dev's own crash handling kick in unpredictably instead of just
// failing cleanly. This reports it plainly and exits immediately - no point
// running the full shutdown() below for a server that never bound at all.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use - a previous server process is still running. ` +
        `Find and stop it: lsof -i :${PORT}, then kill <PID> (or kill -9 <PID> if that doesn't work).`
    );
  } else {
    console.error("Server failed to start:", err);
  }
  process.exit(1);
});

// Without this, Ctrl+C during an in-flight Popular Times scrape (the
// scheduler's own background batch, or an on-demand check) leaves the
// process straggling until that scrape's own timeout gives up - often long
// enough that a fresh `npm run dev` right after hits EADDRINUSE against the
// still-dying old process. Closing the browser and the listening socket
// explicitly, then forcing an exit if anything still hangs, makes Ctrl+C
// actually free the port immediately instead of eventually.
//
// Each step races against its own short timeout (rather than one shared
// timer alongside the real cleanup) so a single wedged operation - a
// Puppeteer browser stuck mid-navigation, a DB pool waiting on a sleeping
// Aiven instance - can't hold up the others or block the final exit.
function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down...`);

  // A hard stop, not a "wait for it to finish" - whatever the scrape was
  // mid-doing is simply abandoned; getCachedPopularTimes has always
  // tolerated a venue with no fresh entry, so nothing here needs its result.
  await Promise.allSettled([
    withTimeout(new Promise<void>((resolve) => server.close(() => resolve())), 3000),
    withTimeout(closeBrowser(), 3000),
    withTimeout(pool.end(), 3000),
  ]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
