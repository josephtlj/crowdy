import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { calls, resetFakePool, setNextRows } from "./fakePool";
import { postJson, withApp } from "./http";
import { authRouter } from "../src/routes/auth";

const INVALID = "Invalid username or password";

beforeEach(() => {
  resetFakePool();
});

test("signup rejects a short username and a short password", async () => {
  await withApp(
    (app) => app.use("/auth", authRouter),
    async (baseUrl) => {
      const shortName = await postJson(baseUrl, "/auth/signup", { username: "ab", password: "password1" });
      const shortPassword = await postJson(baseUrl, "/auth/signup", { username: "tester_1", password: "short" });
      assert.equal(shortName.status, 400);
      assert.equal(shortPassword.status, 400);
      assert.equal(calls.length, 0);
    }
  );
});

test("login uses one message when the account is missing or the password is wrong", async () => {
  const passwordHash = await bcrypt.hash("password1", 4);
  await withApp(
    (app) => app.use("/auth", authRouter),
    async (baseUrl) => {
      setNextRows([]);
      const missing = await postJson(baseUrl, "/auth/login", { username: "tester_1", password: "password1" });

      setNextRows([{ id: 1, password_hash: passwordHash }]);
      const wrong = await postJson(baseUrl, "/auth/login", { username: "tester_1", password: "not-the-password" });

      assert.equal(missing.status, 401);
      assert.equal(wrong.status, 401);
      assert.equal(missing.body.error, INVALID);
      assert.equal(wrong.body.error, INVALID);
    }
  );
});
