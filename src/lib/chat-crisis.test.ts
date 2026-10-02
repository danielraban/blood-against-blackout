import assert from "node:assert/strict";
import test from "node:test";
import { isCrisisAsk, latestUserText } from "./chat-crisis";

test("crisis phrases are detected; ordinary meeting questions are not", () => {
  assert.equal(isCrisisAsk("I want to kill myself"), true);
  assert.equal(isCrisisAsk("thinking about suicide"), true);
  assert.equal(isCrisisAsk("I might overdose tonight"), true);
  assert.equal(isCrisisAsk("beginners tonight"), false);
  assert.equal(isCrisisAsk("what should I expect"), false);
  assert.equal(isCrisisAsk(""), false);
});

test("latest user text comes from the last user message parts", () => {
  assert.equal(
    latestUserText([
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi" }] },
      { role: "user", parts: [{ type: "text", text: "  beginners tonight  " }] },
    ]),
    "beginners tonight",
  );
  assert.equal(latestUserText([]), "");
});
