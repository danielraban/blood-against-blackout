function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function hasAiGatewayAuth() {
  if (envValue("AI_GATEWAY_API_KEY") || envValue("VERCEL_OIDC_TOKEN")) {
    return true;
  }
  // Vercel Functions authenticate AI Gateway with a refreshed OIDC token.
  // Fluid Compute does not always expose that token as VERCEL_OIDC_TOKEN.
  return envValue("VERCEL") === "1";
}
