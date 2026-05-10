#!/usr/bin/env node
/**
 * strava-scraper CLI.
 *
 * Commands:
 * - `auth login`      Open Chrome for interactive login (Playwright)
 * - `auth status`     Print current JWT status / athlete id
 * - `activity <id>`   Download original GPX/FIT/TCX + parse the HTML page
 * - `photos <id>`     Download all photos at HD resolution
 * - `bike <id>`       Download bike components
 *
 * Auth resolution order (per command):
 * 1. `STRAVA_JWT` env var → `JwtCookieAuth`
 * 2. `--jwt <value>` flag → `JwtCookieAuth`
 * 3. `.auth/strava-storage-state.json` → `PersistentContextAuth`
 * 4. Otherwise: error with hint to run `auth login`.
 */

import { program } from "commander";
import { downloadActivityCommand } from "./commands/activity.ts";
import { downloadAthleteCommand } from "./commands/athlete.ts";
import { authLogin, authStatus } from "./commands/auth.ts";
import { downloadBikeCommand } from "./commands/bike.ts";
import { downloadGearCommand } from "./commands/gear.ts";
import { downloadPhotosCommand } from "./commands/photos.ts";

program
  .name("strava-scraper")
  .description("Scrape Strava data the official API hides — original GPX/FIT, photos, gear.")
  .version("0.1.0");

const auth = program.command("auth").description("Authentication helpers");
auth
  .command("login")
  .description("Open Chrome for interactive login. Saves session for future commands.")
  .option("--state <path>", "Where to save the session", ".auth/strava-storage-state.json")
  .option("--force", "Force re-login even if a session exists")
  .action(async (opts) => {
    await authLogin({ statePath: opts.state, force: !!opts.force });
  });
auth
  .command("status")
  .description("Show the current authentication status")
  .option("--jwt <value>", "JWT to validate (overrides STRAVA_JWT)")
  .option("--state <path>", "Path to a saved Playwright session", ".auth/strava-storage-state.json")
  .action(async (opts) => {
    await authStatus({ jwt: opts.jwt, statePath: opts.state });
  });

program
  .command("activity <id>")
  .description("Download an activity's original file + parse its HTML page")
  .option("--format <fmt>", "original | gpx | tcx (default: original)", "original")
  .option("--out <dir>", "Output root directory", "./out")
  .option("--jwt <value>", "JWT (overrides STRAVA_JWT)")
  .option("--state <path>", "Playwright session file", ".auth/strava-storage-state.json")
  .option("--no-page-parse", "Skip downloading + parsing the activity HTML page")
  .action(async (id, opts) => {
    await downloadActivityCommand({
      activityId: id,
      format: opts.format,
      outDir: opts.out,
      jwt: opts.jwt,
      statePath: opts.state,
      parsePage: opts.pageParse !== false,
    });
  });

program
  .command("photos <id>")
  .description("Download all HD photos for an activity")
  .option("--out <dir>", "Output root directory", "./out")
  .option("--jwt <value>", "JWT (overrides STRAVA_JWT)")
  .option("--state <path>", "Playwright session file", ".auth/strava-storage-state.json")
  .action(async (id, opts) => {
    await downloadPhotosCommand({
      activityId: id,
      outDir: opts.out,
      jwt: opts.jwt,
      statePath: opts.state,
    });
  });

program
  .command("bike <id>")
  .description("Download bike component table (id starts with 'b')")
  .option("--out <dir>", "Output root directory", "./out")
  .option("--jwt <value>", "JWT (overrides STRAVA_JWT)")
  .option("--state <path>", "Playwright session file", ".auth/strava-storage-state.json")
  .action(async (id, opts) => {
    await downloadBikeCommand({
      bikeId: id,
      outDir: opts.out,
      jwt: opts.jwt,
      statePath: opts.state,
    });
  });

program
  .command("athlete <id>")
  .description(
    "Scrape any athlete's public profile (name, recent activities, photos). " +
      "With --activities, also batch-download each recent activity (file + parse).",
  )
  .option("--out <dir>", "Output root directory", "./out")
  .option("--jwt <value>", "JWT cookie (overrides STRAVA_JWT)")
  .option("--state <path>", "Playwright session file", ".auth/strava-storage-state.json")
  .option("--activities", "Also batch-download each recent activity", false)
  .option("--limit <n>", "Cap on activities to download (most-recent first)", "0")
  .action(async (id, opts) => {
    await downloadAthleteCommand({
      athleteId: id,
      outDir: opts.out,
      jwt: opts.jwt,
      statePath: opts.state,
      downloadActivities: !!opts.activities,
      limit: Number.parseInt(opts.limit, 10) || 0,
    });
  });

program
  .command("gear")
  .description(
    "Backup ALL gear (bikes + shoes) via HTML scraping. Lists gear from " +
      "/settings/gear, scrapes /bikes/{id} (metadata + components) and " +
      "/shoes/{id} (metadata). OAuth token optional for additive enrichment.",
  )
  .option("--out <dir>", "Output root directory", "./out")
  .option("--jwt <value>", "JWT cookie (overrides STRAVA_JWT)")
  .option("--state <path>", "Playwright session file", ".auth/strava-storage-state.json")
  .option("--api-token <value>", "Optional OAuth token to enrich missing fields")
  .option("--no-components", "Skip the components table scrape (faster)")
  .action(async (opts) => {
    await downloadGearCommand({
      outDir: opts.out,
      jwt: opts.jwt,
      statePath: opts.state,
      apiToken: opts.apiToken ?? process.env["STRAVA_API_TOKEN"],
      noComponents: opts.components === false,
    });
  });

await program.parseAsync(process.argv);
