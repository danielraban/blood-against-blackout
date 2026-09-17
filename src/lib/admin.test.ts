import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  adminCookieHeader,
  checkAdminPassword,
  checkCronSecret,
  clearAdminCookieHeader,
  createAdminSessionValue,
  verifyAdminSession,
} from "./admin";

const env = process.env as Record<string, string | undefined>;
const originalEnv = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("admin sessions accept valid signatures and reject expired or changed values", () => {
  const now = 1_800_000_000;
  const value = createAdminSessionValue("session-secret", now);

  assert.equal(verifyAdminSession(value, "session-secret", now), true);
  assert.equal(verifyAdminSession(value, "wrong-secret", now), false);
  assert.equal(verifyAdminSession(value, "session-secret", now + 7 * 24 * 60 * 60), false);
  assert.equal(verifyAdminSession(`${value}.extra`, "session-secret", now), false);
  assert.equal(verifyAdminSession("not-a-session", "session-secret", now), false);
});

test("admin cookie headers use strict attributes and production security", () => {
  env.ADMIN_SESSION_SECRET = "session-secret";
  env.NODE_ENV = "production";

  assert.match(adminCookieHeader(), /^openchair_admin=\d+\.[A-Za-z0-9_-]+;/);
  assert.match(adminCookieHeader(), /HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
  assert.equal(
    clearAdminCookieHeader(),
    "openchair_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
  );

  delete env.ADMIN_SESSION_SECRET;
  assert.throws(() => adminCookieHeader(), /ADMIN_SESSION_SECRET is not set/);
});

test("admin password comparison requires a configured, exact password", () => {
  env.ADMIN_PASSWORD = "correct horse battery staple";

  assert.equal(checkAdminPassword("correct horse battery staple"), true);
  assert.equal(checkAdminPassword("incorrect"), false);
  assert.equal(checkAdminPassword(""), false);

  delete env.ADMIN_PASSWORD;
  assert.equal(checkAdminPassword("correct horse battery staple"), false);
});

test("cron authorization is fail-closed in production", () => {
  env.NODE_ENV = "production";
  delete env.CRON_SECRET;

  assert.equal(checkCronSecret(new Request("https://example.test")), false);

  env.CRON_SECRET = "cron-secret";
  assert.equal(
    checkCronSecret(
      new Request("https://example.test", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    ),
    true,
  );
  assert.equal(
    checkCronSecret(
      new Request("https://example.test", {
        headers: { authorization: "Bearer wrong" },
      }),
    ),
    false,
  );
});

test("cron authorization permits missing secrets only outside production", () => {
  env.NODE_ENV = "development";
  delete env.CRON_SECRET;

  assert.equal(checkCronSecret(new Request("https://example.test")), true);
});
