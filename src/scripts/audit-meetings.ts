import { runMeetingAudit } from "../lib/audit";

async function main() {
  const json = process.argv.includes("--json");
  const audit = await runMeetingAudit();

  if (json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`Meeting verification audit: ${audit.safe ? "PASS" : "FAIL"}`);
    console.log(`Checked: ${audit.checkedAt}`);
    console.log(`Public verified meetings: ${audit.publicMeetings}`);
    console.log(
      `Suppressed: ${audit.suppressedMeetings} meetings from ${audit.staleFeeds} stale/error feeds`,
    );
    console.log(
      `Unsafe records: schedule=${audit.invalidSchedule}, address=${audit.missingAddress}, coordinates=${audit.invalidCoordinates}, city=${audit.missingCity}, malformedCity=${audit.malformedCityLabels}, duplicateIds=${audit.duplicateMeetingIds}`,
    );
    console.log(
      `Mapping anomalies: ${audit.mappingAnomalies.length}; incomplete runs: ${audit.incompleteRuns}`,
    );
    for (const item of audit.mappingAnomalies.slice(0, 20)) {
      console.log(
        `- ${[item.city, item.state, item.country].filter(Boolean).join(", ")}: ${item.meetings} meetings, ${item.latitudeSpan.toFixed(2)}° x ${item.longitudeSpan.toFixed(2)}°`,
      );
    }
  }

  if (!audit.safe) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
