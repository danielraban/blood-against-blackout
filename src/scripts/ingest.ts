process.loadEnvFile(".env.local");
import { ingestAllFeeds } from "../lib/ingest";

async function main() {
  const result = await ingestAllFeeds();
  console.log(
    `Ingest complete. claimed=${result.feedsClaimed} ok=${result.feedsOk} notModified=${result.feedsNotModified} written=${result.feedsWritten} fail=${result.feedsFail} meetings=${result.meetingsUpserted} budgetExhausted=${result.budgetExhausted} behind=${result.feedsBehindFreshness}`,
  );
  if (result.errors.length) {
    console.log(result.errors.join("\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
