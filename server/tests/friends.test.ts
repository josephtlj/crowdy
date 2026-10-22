import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { calls, queueResults, resetFakePool } from "./fakePool";
import { postJson, withApp } from "./http";
import { friendsRouter } from "../src/routes/friends";

const token = jwt.sign({ accountId: 7 }, process.env.JWT_SECRET ?? "test-secret");
const mount = (app: import("express").Express) => app.use("/friends", friendsRouter);

beforeEach(() => {
  resetFakePool();
});

test("friends routes reject a missing token", async () => {
  await withApp(mount, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/friends`)).status, 401);
    assert.equal(calls.length, 0);
  });
});

test("a friend request is sent, refused for yourself, and refused for unknown usernames", async () => {
  await withApp(mount, async (baseUrl) => {
    queueResults([{ id: 9 }], [], { insertId: 1 });
    const sent = await postJson(baseUrl, "/friends/requests", { username: "oscar" }, token);
    assert.equal(sent.status, 201);
    assert.match(calls[2].sql, /INSERT INTO friendships/);
    assert.deepEqual(calls[2].params, [7, 9]);

    queueResults([{ id: 7 }]);
    const self = await postJson(baseUrl, "/friends/requests", { username: "joseph" }, token);
    assert.equal(self.status, 400);

    queueResults([]);
    const unknown = await postJson(baseUrl, "/friends/requests", { username: "nobody" }, token);
    assert.equal(unknown.status, 404);
  });
});

test("sending a request back to someone who already asked accepts it", async () => {
  await withApp(mount, async (baseUrl) => {
    queueResults([{ id: 9 }], [{ requester_id: 9, addressee_id: 7, status: "pending" }], {});
    const res = await postJson(baseUrl, "/friends/requests", { username: "oscar" }, token);
    assert.equal(res.status, 200);
    assert.match(calls[2].sql, /UPDATE friendships SET status = 'accepted'/);
    assert.deepEqual(calls[2].params, [9, 7]);
  });
});

test("the list shares home stations only for accepted friends", async () => {
  await withApp(mount, async (baseUrl) => {
    queueResults(
      [{ station_id: "punggol" }],
      [
        { requester_id: 7, addressee_id: 9, status: "accepted", other_id: 9, username: "oscar", station_id: "jurong-east" },
        { requester_id: 11, addressee_id: 7, status: "pending", other_id: 11, username: "yikai", station_id: "bishan" },
        { requester_id: 7, addressee_id: 12, status: "pending", other_id: 12, username: "hanwen", station_id: null },
      ]
    );
    const res = await fetch(`${baseUrl}/friends`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    assert.equal(body.homeStationId, "punggol");
    assert.deepEqual(body.friends, [{ accountId: 9, username: "oscar", homeStationId: "jurong-east" }]);
    assert.deepEqual(body.incoming, [{ accountId: 11, username: "yikai" }]);
    assert.deepEqual(body.outgoing, [{ accountId: 12, username: "hanwen" }]);
  });
});

test("the home station must be a real station", async () => {
  await withApp(mount, async (baseUrl) => {
    const put = (stationId: unknown) =>
      fetch(`${baseUrl}/friends/home-station`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stationId }),
      });
    assert.equal((await put("not-a-station")).status, 400);
    assert.equal(calls.length, 0);
  });
});
