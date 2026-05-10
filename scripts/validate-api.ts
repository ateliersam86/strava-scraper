#!/usr/bin/env bun
/**
 * Validate the API client against the real Strava API.
 *
 * Reads STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN from
 * env (or `--env-file` arg). Refreshes the access token, then exercises
 * every endpoint we ship.
 *
 * Run:
 *   bun scripts/validate-api.ts --env-file ../atelier-web-travels/.env
 *   bun scripts/validate-api.ts --env-file ../atelier-web-travels/.env --activity-id 18424208164
 *
 * Outputs a summary report. Saves raw API responses to scripts/_validation/
 * so we can build real-shape fixtures from them.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AthleteSummary,
  StravaApiClient,
  inferGearKind,
  normalizeGear,
  refreshAccessToken,
} from "../packages/core/src/index.ts";

type Args = { envFile?: string; activityId?: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env-file") out.envFile = argv[++i];
    else if (a === "--activity-id") out.activityId = argv[++i];
  }
  return out;
}

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`env file not found: ${path}`);
  const fs = require("node:fs") as typeof import("node:fs");
  const text = fs.readFileSync(path, "utf-8");
  const env: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    env[k] = v;
  }
  return env;
}

const args = parseArgs(process.argv.slice(2));
const env = args.envFile ? { ...process.env, ...loadEnvFile(args.envFile) } : process.env;

const clientId = env["STRAVA_CLIENT_ID"];
const clientSecret = env["STRAVA_CLIENT_SECRET"];
const refreshToken = env["STRAVA_REFRESH_TOKEN"];

if (!clientId || !clientSecret || !refreshToken) {
  console.error(
    "Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_REFRESH_TOKEN. " +
      "Pass --env-file <path> or set them in env.",
  );
  process.exit(1);
}

const outDir = join(import.meta.dir, "_validation");
await mkdir(outDir, { recursive: true });

console.log("→ Refreshing access token");
const tok = await refreshAccessToken({ clientId, clientSecret, refreshToken });
console.log(`  ✓ access_token obtained, expires in ${tok.expires_in}s`);
const expiry = new Date(tok.expires_at * 1000);
console.log(`  ✓ valid until ${expiry.toISOString()}`);

const api = new StravaApiClient({ accessToken: tok.access_token });

// ── 1. /athlete ────────────────────────────────────────────────────────────
console.log("\n→ GET /athlete");
const athlete = (await api.getAthlete()) as AthleteSummary & Record<string, unknown>;
await writeFile(join(outDir, "athlete.json"), JSON.stringify(athlete, null, 2));
console.log(
  `  ✓ id=${athlete.id} username=${athlete.username ?? "?"} bikes=${athlete.bikes?.length ?? 0} shoes=${athlete.shoes?.length ?? 0}`,
);
console.log(`  ✓ rate-limit: ${JSON.stringify(api.lastRateLimit)}`);

// ── 2. /gear/{id} for each bike + shoe ────────────────────────────────────
const allGear = [...(athlete.bikes ?? []), ...(athlete.shoes ?? [])];
console.log(`\n→ GET /gear/{id} × ${allGear.length}`);
for (const ref of allGear) {
  if (!ref.id) continue;
  try {
    const raw = await api.getGear(ref.id);
    await writeFile(join(outDir, `gear-${ref.id}.json`), JSON.stringify(raw, null, 2));
    const normalized = normalizeGear(ref.id, raw);
    const kind = inferGearKind(ref.id);
    const distKm = normalized.distanceMeters ? (normalized.distanceMeters / 1000).toFixed(1) : "?";
    console.log(
      `  ✓ ${ref.id} [${kind}] ${normalized.brandName ?? "?"} ${normalized.modelName ?? normalized.name ?? "?"} (${distKm} km)`,
    );
  } catch (err) {
    console.error(`  ✗ ${ref.id}: ${(err as Error).message}`);
  }
}

// ── 3. Pick an activity (or use --activity-id) and exercise endpoints ────
let activityId: string | number | undefined = args.activityId;
if (!activityId) {
  console.log("\n→ GET /athlete/activities (last 3)");
  const list = (await api.listActivities({ perPage: 3 })) as Array<Record<string, unknown>>;
  await writeFile(join(outDir, "activities-list.json"), JSON.stringify(list, null, 2));
  console.log(`  ✓ ${list.length} activities`);
  activityId = list[0]?.["id"] as number | undefined;
  if (!activityId) {
    console.error("  ✗ No activities returned, can't continue");
    process.exit(1);
  }
}

console.log(`\n→ GET /activities/${activityId}`);
const activity = await api.getActivity(activityId);
await writeFile(join(outDir, `activity-${activityId}.json`), JSON.stringify(activity, null, 2));
console.log(
  `  ✓ name="${activity["name"]}" type=${activity["type"]} distance=${activity["distance"]}m`,
);

console.log(`\n→ GET /activities/${activityId}/streams`);
const streams = await api.getActivityStreams(activityId);
await writeFile(join(outDir, `streams-${activityId}.json`), JSON.stringify(streams, null, 2));
const keys = Object.keys(streams);
console.log(`  ✓ streams: [${keys.join(", ")}]`);
const time = streams.time;
if (time) {
  console.log(
    `  ✓ time stream: ${time.data.length} points, last=${time.data[time.data.length - 1]}s (${Math.round((time.data[time.data.length - 1] ?? 0) / 60)}min)`,
  );
}

console.log(`\n→ GET /activities/${activityId}/photos`);
try {
  const photos = await api.getActivityPhotos(activityId);
  await writeFile(join(outDir, `photos-${activityId}.json`), JSON.stringify(photos, null, 2));
  console.log(`  ✓ ${photos.length} photo(s)`);
} catch (err) {
  console.warn(`  ! photos failed (likely no photos on this activity): ${(err as Error).message}`);
}

console.log("\n──────────────────────────────────────────────────────");
console.log(`Saved raw responses to: ${outDir}`);
console.log(`Final rate-limit: ${JSON.stringify(api.lastRateLimit)}`);
console.log("\n✓ All API endpoints validated against real Strava");
