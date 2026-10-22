import assert from "node:assert/strict";
import { test } from "node:test";
import { withApp } from "./http";
import { rateLimit } from "../src/middleware/rateLimit";

test("a client over the limit gets 429 until the window resets", async () => {
  await withApp(
    (app) => app.get("/limited", rateLimit({ windowMs: 200, max: 2, message: "slow down" }), (_req, res) => res.send("ok")),
    async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
      assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
      const blocked = await fetch(`${baseUrl}/limited`);
      assert.equal(blocked.status, 429);
      assert.deepEqual(await blocked.json(), { error: "slow down" });
      assert.ok(Number(blocked.headers.get("retry-after")) >= 1);

      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
    }
  );
});
