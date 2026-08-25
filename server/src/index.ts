process.loadEnvFile(); // reads server/.env - must run before anything reads process.env

import express from "express";
import cors from "cors";
import { venuesRouter } from "./routes/venues";

const app = express();
app.use(cors());

app.use("/venues", venuesRouter);

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "crowdy-server" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Crowdy server listening on http://localhost:${PORT}`);
});
