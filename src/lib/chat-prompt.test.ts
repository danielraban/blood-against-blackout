import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_EMERGENCY_GUIDANCE, chatSystemPrompt } from "./chat-prompt";

test("chat prompt always includes emergency contacts and the non-affiliation line", () => {
  const prompt = chatSystemPrompt();
  assert.match(prompt, /988/);
  assert.match(prompt, /116 123/);
  assert.match(prompt, /not affiliated/i);
  assert.match(prompt, /Nearby or pick a city/);
  assert.ok(prompt.includes(CHAT_EMERGENCY_GUIDANCE));
});
