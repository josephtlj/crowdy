process.loadEnvFile(); // reads server/.env - must run before anything reads process.env

import express from "express";
import cors from "cors";
import { venuesRouter } from "./routes/venues";
import { linesRouter } from "./routes/lines";
import { authRouter } from "./routes/auth";
import { favouritesRouter } from "./routes/favourites";
import { startPopularTimesScheduler } from "./services/popularTimesScheduler";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/venues", venuesRouter);
app.use("/lines", linesRouter);
app.use("/auth", authRouter);
app.use("/favourites", favouritesRouter);

startPopularTimesScheduler();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "crowdy-server" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Crowdy server listening on http://localhost:${PORT}`);
});
