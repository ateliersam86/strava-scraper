#!/usr/bin/env bun
/**
 * End-to-end validation of the atelier-web-travels integration adapter
 * against real Strava data captured by validate-api.ts.
 *
 * Loads the saved `activity-{id}.json` + `streams-{id}.json` from
 * scripts/_validation/ and runs them through enrichTripSegmentFromScraper.
 * Asserts that the output has per-point ISO timestamps — i.e. the timelapse
 * widget would now have `hasTimestamps: true`-equivalent data.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  enrichTripSegmentFromScraper,
  normalizeStreamsResponse,
  parseActivityPage,
} from "../packages/core/src/index.ts";
import type { Activity } from "../packages/core/src/types/activity.ts";

const dir = join(import.meta.dir, "_validation");
const files = await readdir(dir);
const activityFile = files.find((f) => /^activity-\d+\.json$/.test(f));
const streamsFile = files.find((f) => /^streams-\d+\.json$/.test(f));
if (!activityFile || !streamsFile) {
  console.error(`Missing fixtures in ${dir}. Run validate-api.ts first.`);
  process.exit(1);
}

const activityRaw = JSON.parse(await readFile(join(dir, activityFile), "utf-8"));
const streamsRaw = JSON.parse(await readFile(join(dir, streamsFile), "utf-8"));

console.log("→ Loaded fixtures from validate-api.ts");
console.log(`  ${activityFile} : "${activityRaw.name}" (${activityRaw.type})`);

// 1. Normalize streams (handles both array and object shapes)
const streams = normalizeStreamsResponse(streamsRaw);
console.log(`  streams normalized → keys: [${Object.keys(streams).join(", ")}]`);
const timeStream = streams.time;
console.log(
  `  time stream: ${timeStream?.data.length ?? 0} points (${Math.round((timeStream?.data[timeStream.data.length - 1] ?? 0) / 60)}min)`,
);

// 2. Adapt the API activity payload into our Activity type. The API response
//    has slightly different field names than the HTML parser — for the
//    integration we just need startDateUtc + stats.distanceMeters.
const activity: Activity = {
  id: activityRaw.id,
  startDateUtc: activityRaw.start_date,
  startDateLocal: activityRaw.start_date_local,
  name: activityRaw.name,
  type: activityRaw.type,
  stats: {
    distanceMeters: activityRaw.distance,
    movingTimeSeconds: activityRaw.moving_time,
    elapsedTimeSeconds: activityRaw.elapsed_time,
    totalElevationGainMeters: activityRaw.total_elevation_gain,
    averageSpeedMetersPerSecond: activityRaw.average_speed,
  },
};

// 3. Run the integration adapter
const segment = { id: `strava-${activity.id}` };
const enriched = enrichTripSegmentFromScraper(segment, { activity, streams });

console.log("\n→ enrichTripSegmentFromScraper result");
console.log(`  startTime         = ${enriched.startTime}`);
console.log(`  movingDurationS   = ${enriched.movingDurationS}`);
console.log(`  totalDurationS    = ${enriched.totalDurationS}`);
console.log(`  distanceKm        = ${enriched.distanceKm?.toFixed(2)}`);
console.log(`  elevationGain     = ${enriched.elevationGain}`);
console.log(`  averageSpeedKmh   = ${enriched.averageSpeedKmh}`);
console.log(`  profile points    = ${enriched.profile?.length}`);

const profile = enriched.profile ?? [];
if (profile.length === 0) {
  console.error("\n✗ No profile points generated!");
  process.exit(1);
}

// 4. Sanity check: profile timestamps must be monotonically increasing
let monotonicViolations = 0;
let lastIso: string | undefined;
for (const p of profile) {
  if (lastIso && p.time && p.time < lastIso) monotonicViolations++;
  if (p.time) lastIso = p.time;
}
console.log("\n→ Profile timestamps");
console.log(`  first   ${profile[0]?.time}`);
console.log(`  middle  ${profile[Math.floor(profile.length / 2)]?.time}`);
console.log(`  last    ${profile[profile.length - 1]?.time}`);
console.log(`  monotonic violations: ${monotonicViolations}`);

if (monotonicViolations === 0 && profile[0]?.time && profile[profile.length - 1]?.time) {
  console.log("\n✓ Integration adapter produces valid per-point ISO timestamps");
  console.log("  → The timelapse widget can be migrated off `segmentBoundaries` interpolation");
} else {
  console.error("\n✗ Integration adapter has issues");
  process.exit(1);
}

// 5. Verify HTML activity parser shape vs API shape (best effort)
console.log("\n→ Cross-check: API activity ↔ HTML parser expectations");
const expectedFields = [
  "id",
  "name",
  "type",
  "start_date",
  "distance",
  "moving_time",
  "elapsed_time",
  "total_elevation_gain",
  "average_speed",
  "kudos_count",
  "comment_count",
];
const present = expectedFields.filter((f) => activityRaw[f] !== undefined);
const missing = expectedFields.filter((f) => activityRaw[f] === undefined);
console.log(`  fields present in API:  ${present.length}/${expectedFields.length}`);
if (missing.length) console.log(`  missing in API:         ${missing.join(", ")}`);

// Try the HTML parser on the activity page (it'll fail because there's no embedded JSON)
console.log("  (HTML parser test requires raw HTML — skipped, see browse skill)");

void parseActivityPage; // keep import alive
