import { migrateDatabase } from "../lib/db-migrate";

try {
  process.loadEnvFile(".env.local");
} catch {
  // DATABASE_URL may already be set in the environment.
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const logs = await migrateDatabase(databaseUrl);
  for (const line of logs) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
