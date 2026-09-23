import assert from "node:assert/strict";
import test from "node:test";
import { allocateDiscoverFeedId, extractHttpsHosts, guessFellowship, guessRegion } from "./discover-hosts";

test("extracts intergroup hosts from A.A. Near You HTML", () => {
  const hosts = extractHttpsHosts(`
    <a href="https://aasfmarin.org/meetings">SF</a>
    <a href="https://www.aa.org/aa-near-you">skip</a>
    <a href="https://aatoronto.org">Toronto</a>
  `);
  assert.ok(hosts.includes("aasfmarin.org"));
  assert.ok(hosts.includes("aatoronto.org"));
  assert.equal(hosts.includes("www.aa.org"), false);
});

test("guesses fellowship and region from hostnames", () => {
  assert.equal(guessFellowship("bmlt.naohio.org"), "na");
  assert.equal(guessFellowship("ca4la.org"), "ca");
  assert.equal(guessRegion("aaglasgow.org.uk"), "GB");
  assert.equal(guessRegion("aatoronto.org"), "CA");
});

test("uses a new id when a homepage feed resolves to a different host", () => {
  assert.equal(
    allocateDiscoverFeedId({
      candidateId: "honolulu",
      candidateUrl: "https://oahucentraloffice.com/wp-admin/admin-ajax.php?action=meetings",
      resolvedUrl: "https://oahuaa.org/wp-admin/admin-ajax.php?action=meetings",
      existingIds: ["honolulu"],
    }),
    "oahuaa-org",
  );
});
