import assert from "node:assert/strict";
import test from "node:test";
import type { LookupAddress } from "node:dns";
import { assertPublicHttpsUrl } from "./url-security";

const addresses = (...values: string[]) => async (): Promise<LookupAddress[]> =>
  values.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));

test("accepts public HTTPS IP addresses", async () => {
  assert.equal(
    (await assertPublicHttpsUrl("https://8.8.8.8/feed.json")).href,
    "https://8.8.8.8/feed.json",
  );
  assert.equal(
    (await assertPublicHttpsUrl("https://[2606:4700:4700::1111]/feed.json")).href,
    "https://[2606:4700:4700::1111]/feed.json",
  );
});

test("accepts hostnames only when every resolved address is public", async () => {
  const url = await assertPublicHttpsUrl(
    "https://meetings.example.test/feed.json",
    addresses("203.0.113.10", "2001:db8::10"),
  );
  assert.equal(url.hostname, "meetings.example.test");

  await assert.rejects(
    assertPublicHttpsUrl(
      "https://meetings.example.test/feed.json",
      addresses("203.0.113.10", "10.0.0.5"),
    ),
    /resolve only to public addresses/,
  );
  await assert.rejects(
    assertPublicHttpsUrl(
      "https://meetings.example.test/feed.json",
      addresses("::ffff:a00:1"),
    ),
    /resolve only to public addresses/,
  );
});

test("rejects private, loopback, link-local, and reserved addresses", async () => {
  for (const host of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.10.20",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "[::1]",
    "[fd00::1]",
    "[::ffff:10.0.0.1]",
  ]) {
    await assert.rejects(
      assertPublicHttpsUrl(`https://${host}/feed.json`),
      /Private feed addresses are not allowed/,
    );
  }
});

test("rejects unsafe URL forms before DNS resolution", async () => {
  for (const raw of [
    "not a url",
    "http://example.test/feed.json",
    "https://user:password@example.test/feed.json",
    "https://example.test:8443/feed.json",
    "https://localhost/feed.json",
    "https://feeds.service.internal/feed.json",
    `https://example.test/${"a".repeat(2048)}`,
  ]) {
    await assert.rejects(assertPublicHttpsUrl(raw));
  }
});

test("rejects unresolvable and empty DNS results", async () => {
  await assert.rejects(
    assertPublicHttpsUrl("https://example.test/feed.json", async () => {
      throw new Error("DNS failed");
    }),
    /could not be resolved/,
  );
  await assert.rejects(
    assertPublicHttpsUrl("https://example.test/feed.json", addresses()),
    /resolve only to public addresses/,
  );
});
