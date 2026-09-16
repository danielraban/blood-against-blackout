process.loadEnvFile(".env.local");
import { ingestAllFeeds } from "../lib/ingest";

async function main() {
  const result = await ingestAllFeeds();
  console.log(
    `Ingest complete. ok=${result.feedsOk} fail=${result.feedsFail} meetings=${result.meetingsUpserted}`,
  );
  if (result.errors.length) {
    console.log(result.errors.join("\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
