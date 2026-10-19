import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGuestSavesIntoAccount } from "../src/services/mergeGuestSaves";

test("a successful merge clears the on-device guest list", async () => {
  const persisted: Set<string>[] = [];
  const result = await mergeGuestSavesIntoAccount(
    "token",
    ["vivocity"],
    async () => {},
    async (ids) => {
      persisted.push(ids);
    }
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].size, 0);
});

test("a failed merge leaves the on-device guest list in place", async () => {
  let persisted = false;
  const result = await mergeGuestSavesIntoAccount(
    "token",
    ["vivocity"],
    async () => {
      throw new Error("database down");
    },
    async () => {
      persisted = true;
    }
  );
  assert.equal(result.ok, false);
  assert.equal(persisted, false);
});