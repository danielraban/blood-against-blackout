import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalFeedUrl,
  fallbackFeedUrls,
  feedIdsToReplaceForCatalog,
  isProbablyJson,
  tsmlCandidateUrls,
} from "./feed-url";

test("catalog seeding replaces discovered ids that already own a feed URL", () => {
  const url = "https://oc-aa.org/wp-admin/admin-ajax.php?action=meetings";
  assert.deepEqual(
    feedIdsToReplaceForCatalog(
      [{ id: "oc-aa", url }],
      [{ id: "oc-aa-org", url }],
    ),
    ["oc-aa-org"],
  );
  assert.deepEqual(
    feedIdsToReplaceForCatalog(
      [{ id: "oc-aa", url }],
      [
        {
          id: "www-oc-aa-org",
          url: "https://www.oc-aa.org/wp-admin/admin-ajax.php?action=meetings",
        },
      ],
    ),
    ["www-oc-aa-org"],
  );
  assert.deepEqual(
    feedIdsToReplaceForCatalog(
      [{ id: "oc-aa", url }],
      [{ id: "oc-aa", url }],
    ),
    [],
  );
});

test("canonical feed URLs drop www and trailing slashes", () => {
  assert.equal(
    canonicalFeedUrl("https://www.aa-london.com/api/meetingguide/"),
    canonicalFeedUrl("https://aa-london.com/api/meetingguide"),
  );
});

test("WordPress feeds get JSON fallbacks", () => {
  const fallbacks = fallbackFeedUrls(
    "https://aasfmarin.org/wp-admin/admin-ajax.php?action=meetings",
  );
  assert.ok(fallbacks.some((url) => url.includes("/wp-json/tsml/v1/meetings")));
  assert.ok(fallbacks.some((url) => url.includes("tsml-feed=1")));
});

test("TSML candidate URLs cover Meeting Guide and plugin paths", () => {
  const urls = tsmlCandidateUrls("aasanjose.org");
  assert.ok(urls.some((url) => url.includes("/wp-json/tsml/v1/meetings")));
  assert.ok(urls.some((url) => url.includes("/api/meetingguide")));
});

test("HTML bodies are not treated as JSON", () => {
  assert.equal(isProbablyJson("text/html", "<html><head>"), false);
  assert.equal(isProbablyJson("application/json", "[]"), true);
  assert.equal(isProbablyJson("text/plain", "<!DOCTYPE html>"), false);
  assert.equal(isProbablyJson("text/html; charset=UTF-8", "[{}]"), true);
});

test("BMLT search URLs also try index.php", () => {
  const fallbacks = fallbackFeedUrls(
    "https://bmlt.wisconsinna.org/main_server/client_interface/json/?switcher=GetSearchResults",
  );
  assert.ok(fallbacks.some((url) => url.includes("index.php")));
});

test("BMLT roots fall back to GetSearchResults JSON", () => {
  const fallbacks = fallbackFeedUrls("https://bmlt.wisconsinna.org/main_server/");
  assert.equal(
    fallbacks[0],
    "https://bmlt.wisconsinna.org/main_server/client_interface/json/?switcher=GetSearchResults",
  );
});
