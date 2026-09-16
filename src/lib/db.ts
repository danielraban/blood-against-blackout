import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { requireServerEnv } from "./env";

function createDb() {
  const url = requireServerEnv("DATABASE_URL");
  const sql = neon(url);
  return drizzle(sql, { schema });
}

let dbInstance: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = createDb();
  }
  return dbInstance;
}
