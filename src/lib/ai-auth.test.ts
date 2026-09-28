import assert from "node:assert/strict";
import test from "node:test";
import { hasAiGatewayAuth } from "./ai-auth";

const KEYS = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL"] as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, run: () => void) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("AI Gateway auth is fail-closed without a key, OIDC token, or Vercel runtime", () => {
  withEnv({}, () => {
    assert.equal(hasAiGatewayAuth(), false);
  });
});

test("AI Gateway auth accepts an API key or OIDC token", () => {
  withEnv({ AI_GATEWAY_API_KEY: "placeholder-gateway-key" }, () => {
    assert.equal(hasAiGatewayAuth(), true);
  });
  withEnv({ VERCEL_OIDC_TOKEN: "placeholder-oidc-token" }, () => {
    assert.equal(hasAiGatewayAuth(), true);
  });
});

test("AI Gateway auth treats the Vercel runtime as OIDC-capable", () => {
  withEnv({ VERCEL: "1" }, () => {
    assert.equal(hasAiGatewayAuth(), true);
  });
});
