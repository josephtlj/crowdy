import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { calls, resetFakePool } from "./fakePool";
import { postJson, withApp } from "./http";
import { favouritesRouter } from "../src/routes/favourites";

const token = jwt.sign({ accountId: 7 }, process.env.JWT_SECRET ?? "test-secret");

beforeEach(() => {
  resetFakePool();
});

test("favourites routes reject a missing token", async () => {
  await withApp(
    (app) => app.use("/favourites", favouritesRouter),
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/favourites`);
      assert.equal(res.status, 401);
      assert.equal(calls.length, 0);
    }
  );
});

test("save, unsave, and merge write the account id from the token", async () => {
  await withApp(
    (app) => app.use("/favourites", favouritesRouter),
    async (baseUrl) => {
      const save = await postJson(baseUrl, "/favourites", { venueId: "vivocity" }, token);
      assert.equal(save.status, 204);
      assert.match(calls[0].sql, /INSERT IGNORE INTO favourites/);
      assert.deepEqual(calls[0].params, [7, "vivocity"]);

      const remove = await fetch(`${baseUrl}/favourites/vivocity`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(remove.status, 204);
      assert.match(calls[1].sql, /DELETE FROM favourites/);
      assert.deepEqual(calls[1].params, [7, "vivocity"]);

      const merge = await postJson(baseUrl, "/favourites/merge", { venueIds: ["ion-orchard", "vivocity"] }, token);
      assert.equal(merge.status, 204);
      assert.match(calls[2].sql, /INSERT IGNORE INTO favourites/);
      assert.deepEqual(calls[2].params, [
        [
          [7, "ion-orchard"],
          [7, "vivocity"],
        ],
      ]);
    }
  );
});
