import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalFeedUrl,
  fallbackFeedUrls,
  isProbablyJson,
} from "./feed-url";

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
