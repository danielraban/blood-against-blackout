const REQUIRED_SERVER_ENV = [
  "DATABASE_URL",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "CRON_SECRET",
] as const;
export type RequiredServerEnv = (typeof REQUIRED_SERVER_ENV)[number];

export function requireServerEnv(name: RequiredServerEnv) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function missingProductionEnv() {
  return REQUIRED_SERVER_ENV.filter((name) => !process.env[name]?.trim());
}
